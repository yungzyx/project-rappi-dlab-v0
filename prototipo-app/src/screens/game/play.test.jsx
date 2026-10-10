import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { GameApp as App } from './GameApp.testkit.jsx'
import { DATA } from '../../game/data.js'
import { cardsOf } from '../../game/knowledge.js'
import { initialState } from '../../game/progress.js'
import { makeRound } from '../../game/round.js'
import { KEY } from '../../game/storage.js'
import { seed } from '../../game/testSeed.js'

beforeEach(() => {
  localStorage.clear()
  seed()
})
afterEach(cleanup)

const stored = () => JSON.parse(localStorage.getItem(KEY))
const preload = seed

function startRound(vertical, level = 'Sin sello') {
  render(<App />)
  const path = screen.getByRole('region', { name: 'Camino de verticales' })
  fireEvent.click(within(path).getByRole('button', { name: new RegExp(`^${DATA.labels[vertical]}: ${level}`) }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Jugar' }))
}

/** Juega la ronda entera; `pick(challenge)` decide qué opción tocar. */
function playRound(round, pick) {
  for (const step of round) {
    if (step.type === 'dato') {
      fireEvent.click(screen.getByRole('button', { name: 'Dar vuelta' }))
    } else {
      const option = step.challenge.options.find((o) => o.id === pick(step.challenge))
      fireEvent.click(
        within(screen.getByRole('group', { name: 'Opciones' })).getByRole('button', { name: option.label }),
      )
    }
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  }
}

describe('ronda', () => {
  test('un dato se da vuelta: «¿Sabías que…?» y, atrás, el dato con su fuente (en una pestaña nueva)', () => {
    const [dato] = makeRound(initialState(), 'chocolateria')
    startRound('chocolateria')
    expect(screen.getByText('¿Sabías que…?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Dar vuelta' }))
    expect(screen.getByRole('heading', { level: 2, name: dato.card.title })).toBeTruthy()
    expect(screen.getByText(dato.card.text)).toBeTruthy()
    const source = screen.getByRole('link', { name: dato.card.source.title })
    expect(source.getAttribute('href')).toBe(dato.card.source.url)
    expect(source.getAttribute('target')).toBe('_blank')
    expect(source.getAttribute('rel')).toMatch(/noopener/)
    expect(screen.getByText('+10 XP')).toBeTruthy()
    expect(stored().xp).toBe(10)
  })

  test('una pregunta curiosa: ¡Correcto! con 20 XP, explicación y fuente; errar muestra la respuesta y 5 XP', () => {
    const round = makeRound(initialState(), 'supermercado')
    startRound('supermercado')
    fireEvent.click(screen.getByRole('button', { name: 'Dar vuelta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    const ch = round[1].challenge
    expect(screen.getByText('Pregunta curiosa')).toBeTruthy()
    expect(screen.getByText(ch.question)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: ch.options.find((o) => o.id === ch.answer).label }))
    expect(screen.getByText('¡Correcto!')).toBeTruthy()
    expect(screen.getByText('+20 XP')).toBeTruthy()
    expect(screen.getByText(ch.explanation)).toBeTruthy()
    expect(screen.getByRole('link', { name: ch.source.title }).getAttribute('target')).toBe('_blank')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dar vuelta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    const wrong = round[3].challenge
    fireEvent.click(screen.getByRole('button', { name: wrong.options.find((o) => o.id !== wrong.answer).label }))
    expect(screen.getByText('Casi')).toBeTruthy()
    expect(screen.getByText('+5 XP')).toBeTruthy()
    expect(screen.getByText(wrong.explanation)).toBeTruthy()
  })

  test('una ronda perfecta da 3 estrellas, una carta y completa la misión del día', () => {
    const round = makeRound(initialState(), 'supermercado')
    startRound('supermercado')
    playRound(round, (ch) => ch.answer)
    expect(screen.getByRole('heading', { name: '¡Ronda completa!' })).toBeTruthy()
    expect(screen.getByLabelText('3 de 3 estrellas')).toBeTruthy()
    expect(screen.getByText('+80 XP')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir carta' }))
    expect(screen.getByText(round[0].card.text)).toBeTruthy()
    expect(screen.getByText('Misión del día completa: +50 XP')).toBeTruthy()
    expect(stored().daily.done).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Seguir' }))
    expect(screen.getByRole('region', { name: 'Camino de verticales' })).toBeTruthy()
  })

  test('subir de nivel muestra el sello nuevo al terminar', () => {
    const v = 'chocolateria'
    preload({
      discovered: {
        [v]: cardsOf(v)
          .slice(0, 4)
          .map((c) => c.id),
      },
      correct: { [v]: 3 },
      answered: { [v]: 3 },
    })
    const round = makeRound(JSON.parse(localStorage.getItem(KEY)), v)
    startRound(v, 'Explorador')
    playRound(round, (ch) => ch.answer)
    expect(screen.getByText(`Nuevo sello: Conocedor de ${DATA.labels[v]}`)).toBeTruthy()
  })

  test('salir a mitad de ronda guarda lo ganado', () => {
    startRound('turbo')
    fireEvent.click(screen.getByRole('button', { name: 'Dar vuelta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }))
    const confirm = screen.getByRole('dialog', { name: '¿Salir de la ronda?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Seguir jugando' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salir de la ronda' }))
    expect(screen.getByRole('region', { name: 'Camino de verticales' })).toBeTruthy()
    expect(stored().xp).toBe(10)
  })
})
