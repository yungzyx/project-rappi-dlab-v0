import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fixture, gameChallenge, gameServer, stubApi } from '../../api/testing'
import { GameApp as App, mount } from './GameApp.testkit.jsx'
import { cardsOf } from '../../game/knowledge.js'
import { initialState } from '../../game/progress.js'
import { makeRound } from '../../game/round.js'
import { seed, stored } from '../../game/testSeed.js'
import { LABELS } from '../../game/verticals.js'

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

/** La ronda como la arma la app con el desafío que responde la API (la semilla es lo respondido en la vertical). */
const roundOf = (state, vertical) =>
  makeRound(state, vertical, gameChallenge(vertical, String(state.answered[vertical] ?? 0)))

/** Abre el camino y toca «Jugar» en una vertical; la ronda recién parte cuando llega su desafío de la API. */
async function openRound(vertical, level = 'Sin sello') {
  await mount(<App />)
  const path = screen.getByRole('region', { name: 'Camino de verticales' })
  fireEvent.click(within(path).getByRole('button', { name: new RegExp(`^${LABELS[vertical]}: ${level}`) }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Jugar' }))
}

/** Abre la ronda y espera su primer paso (un dato). */
async function startRound(vertical, level) {
  await openRound(vertical, level)
  await screen.findByRole('button', { name: 'Dar vuelta' })
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
  test('the round shows the challenge from the API', async () => {
    const challenge = { ...fixture('game-challenge'), question: '¿Qué va con las galletas de la API?' }
    const fetchMock = stubApi({ 'GET /game/challenge': challenge })
    await startRound('supermercado')
    // dato, pregunta, dato; el desafío es el cuarto paso
    fireEvent.click(screen.getByRole('button', { name: 'Dar vuelta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Opciones' })).getAllByRole('button')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dar vuelta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByText('Arma el combo')).toBeTruthy()
    expect(screen.getByText(challenge.question)).toBeTruthy()
    expect(screen.getByRole('button', { name: '☕ Café' })).toBeTruthy()
    const asked = fetchMock.mock.calls.map(([url]) => url).filter((url) => url.includes('/game/challenge'))
    expect(asked).toHaveLength(1)
    expect(asked[0]).toContain('vertical=supermercado')
    expect(asked[0]).toContain('seed=0')
  })

  test('the round shows Sin conexión with Reintentar when the challenge fails, and retries', async () => {
    let calls = 0
    stubApi({ 'GET /game/challenge': (req) => (++calls === 1 ? 'offline' : gameChallenge('licores', req.query.get('seed'))) })
    await openRound('licores')
    expect(await screen.findByRole('heading', { name: /^Sin conexión/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Dar vuelta' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('button', { name: 'Dar vuelta' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /^Sin conexión/ })).toBeNull()
    expect(calls).toBe(2)
  })

  test('un dato se da vuelta: «¿Sabías que…?» y, atrás, el dato con su fuente (en una pestaña nueva)', async () => {
    const [dato] = roundOf(initialState(), 'chocolateria')
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
    const [dato] = roundOf(initialState(), 'chocolateria')
    await startRound('chocolateria')
    fireEvent.click(screen.getByRole('button', { name: 'Dar vuelta' }))
    fireEvent.keyDown(screen.getByRole('link', { name: dato.card.source.title }), { key: 'Enter' })
    expect(screen.getByRole('heading', { level: 2, name: dato.card.title })).toBeTruthy()
  })

  test('una pregunta curiosa: ¡Correcto! con 20 XP, explicación y fuente; errar muestra la respuesta y 5 XP', async () => {
    const round = roundOf(initialState(), 'supermercado')
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
    const round = roundOf(initialState(), 'supermercado')
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
    const round = roundOf(gameServer.state, v)
    await startRound(v, 'Explorador')
    playRound(round, (ch) => ch.answer)
    expect(screen.getByText(`Nuevo sello: Conocedor de ${LABELS[v]}`)).toBeTruthy()
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
