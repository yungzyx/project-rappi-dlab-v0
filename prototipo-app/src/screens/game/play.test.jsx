import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { gameServer, stubApi } from '../../api/testing'
import { GameApp as App, mount } from './GameApp.testkit.jsx'
import { DATA } from '../../game/data.js'
import { cardsOf } from '../../game/knowledge.js'
import { initialState } from '../../game/progress.js'
import { makeRound } from '../../game/round.js'
import { seed, stored } from '../../game/testSeed.js'

beforeEach(() => {
  localStorage.clear()
  stubApi({})
  seed()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const preload = seed

async function startRound(vertical, level = 'Sin sello') {
  await mount(<App />)
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
  test('un dato se da vuelta: «¿Sabías que…?» y, atrás, el dato con su fuente (en una pestaña nueva)', async () => {
    const [dato] = makeRound(initialState(), 'chocolateria')
    await startRound('chocolateria')
    expect(screen.getByText('¿Sabías que…?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Dar vuelta' }))
    expect(screen.getByRole('heading', { level: 2, name: dato.card.title })).toBeTruthy()
    expect(screen.getByText(dato.card.text)).toBeTruthy()
    const source = screen.getByRole('link', { name: dato.card.source.title })
    expect(source.getAttribute('href')).toBe(dato.card.source.url)
    expect(source.getAttribute('target')).toBe('_blank')
    expect(source.getAttribute('rel')).toMatch(/noopener/)
    expect(screen.getByText('+10 XP')).toBeTruthy()
    await waitFor(() => expect(stored().xp).toBe(10))
  })

  test('la tecla 4 en una pregunta de 3 alternativas no hace nada (ni deja un error)', async () => {
    await startRound('supermercado')
    fireEvent.click(screen.getByRole('button', { name: 'Dar vuelta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    const errors = []
    const onError = (e) => {
      errors.push(e.message)
      e.preventDefault()
    }
    window.addEventListener('error', onError)
    fireEvent.keyDown(window, { key: '4' })
    window.removeEventListener('error', onError)
    expect(errors).toEqual([])
    expect(screen.queryByText('¡Correcto!')).toBeNull()
    expect(screen.queryByText('Casi')).toBeNull()
  })

  test('Enter sobre «Fuente: …» abre el enlace y no sigue la ronda', async () => {
    const [dato] = makeRound(initialState(), 'chocolateria')
    await startRound('chocolateria')
    fireEvent.click(screen.getByRole('button', { name: 'Dar vuelta' }))
    fireEvent.keyDown(screen.getByRole('link', { name: dato.card.source.title }), { key: 'Enter' })
    expect(screen.getByRole('heading', { level: 2, name: dato.card.title })).toBeTruthy()
  })

  test('una pregunta curiosa: ¡Correcto! con 20 XP, explicación y fuente; errar muestra la respuesta y 5 XP', async () => {
    const round = makeRound(initialState(), 'supermercado')
    await startRound('supermercado')
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

  test('una ronda perfecta da 3 estrellas, una carta y completa la misión del día', async () => {
    const round = makeRound(initialState(), 'supermercado')
    await startRound('supermercado')
    playRound(round, (ch) => ch.answer)
    expect(screen.getByRole('heading', { name: '¡Ronda completa!' })).toBeTruthy()
    expect(screen.getByLabelText('3 de 3 estrellas')).toBeTruthy()
    expect(screen.getByText('+80 XP')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir carta' }))
    expect(screen.getByText(round[0].card.text)).toBeTruthy()
    expect(screen.getByText('Misión del día completa: +50 XP')).toBeTruthy()
    await waitFor(() => expect(stored().daily.done).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Seguir' }))
    expect(screen.getByRole('region', { name: 'Camino de verticales' })).toBeTruthy()
  })

  test('subir de nivel muestra el sello nuevo al terminar', async () => {
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
    const round = makeRound(gameServer.state, v)
    await startRound(v, 'Explorador')
    playRound(round, (ch) => ch.answer)
    expect(screen.getByText(`Nuevo sello: Conocedor de ${DATA.labels[v]}`)).toBeTruthy()
  })

  test('salir a mitad de ronda guarda lo ganado', async () => {
    await startRound('turbo')
    fireEvent.click(screen.getByRole('button', { name: 'Dar vuelta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }))
    const confirm = screen.getByRole('dialog', { name: '¿Salir de la ronda?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Seguir jugando' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salir de la ronda' }))
    expect(screen.getByRole('region', { name: 'Camino de verticales' })).toBeTruthy()
    await waitFor(() => expect(stored().xp).toBe(10))
  })
})
