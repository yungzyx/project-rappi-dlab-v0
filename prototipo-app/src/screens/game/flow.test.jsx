import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { GameApp as App } from './GameApp.testkit.jsx'
import { conceptsOf } from '../../game/data.js'
import { FACTS } from '../../game/facts.js'
import { initialState, today } from '../../game/progress.js'
import { makeRound } from '../../game/round.js'
import { seed, stored } from '../../game/testSeed.js'
import { routeForScreen } from '../../data/verticals'
import { REPLAY_EVENT } from '../../state/liveMemory'

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const nav = () => screen.getByRole('navigation')
// Misión de hoy casi lista: 2 conceptos y 1 acierto; falta abrir una carta (la primera, ya ganada).
const almostDone = () =>
  seed({ cards: [FACTS[0].id], daily: { date: today(), discovered: 2, correct: 1, opened: 0, done: false } })

describe('bienvenida', () => {
  test('la primera vez Bigotes da la bienvenida y «Empezar» abre la primera ronda', () => {
    render(<App />)
    const intro = screen.getByRole('dialog', { name: 'Bienvenida' })
    fireEvent.click(within(intro).getByRole('button', { name: 'Empezar' }))
    expect(screen.getByText('Concepto nuevo')).toBeTruthy()
    expect(stored().seenIntro).toBe(true)
  })

  test('con la bienvenida vista no vuelve a aparecer', () => {
    seed()
    render(<App />)
    expect(screen.queryByRole('dialog', { name: 'Bienvenida' })).toBeNull()
  })
})

describe('misión del día', () => {
  test('el cofre se puede tocar: explica qué falta y lleva a jugar', () => {
    seed()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Misión del día/ }))
    const sheet = screen.getByRole('dialog', { name: 'Misión del día' })
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(3)
    fireEvent.click(within(sheet).getByRole('button', { name: 'Jugar ahora' }))
    expect(screen.getByRole('progressbar', { name: 'Avance de la ronda' })).toBeTruthy()
  })

  test('completarla fuera de una ronda muestra un aviso con la racha', () => {
    almostDone()
    render(<App />)
    fireEvent.click(within(nav()).getByRole('button', { name: /Álbum/ }))
    fireEvent.click(screen.getByRole('button', { name: `Leer carta: ${FACTS[0].title}` }))
    const toast = screen.getByRole('status', { name: 'Aviso' })
    expect(within(toast).getByText('¡Misión del día completa!')).toBeTruthy()
    expect(within(toast).getByText('+50 XP · racha de 1 día')).toBeTruthy()
    expect(stored().daily.done).toBe(true)
  })
})

describe('ronda', () => {
  test('pedir salir confirma antes', () => {
    seed()
    render(<App />)
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Camino de verticales' })).getByRole('button', {
        name: /^Turbo: Sin sello/,
      }),
    )
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Jugar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }))
    expect(screen.getByRole('dialog', { name: '¿Salir de la ronda?' })).toBeTruthy()
  })

  test('se juega con el teclado: 1 a 4 responden, Enter sigue', () => {
    seed({ discovered: { chocolateria: conceptsOf('chocolateria').map((c) => c.id) } })
    const round = makeRound(
      { ...initialState(), discovered: { chocolateria: conceptsOf('chocolateria').map((c) => c.id) } },
      'chocolateria',
    )
    render(<App />)
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Camino de verticales' })).getByRole('button', {
        name: /^Chocolatería: Explorador/,
      }),
    )
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Jugar' }))
    const first = round[0].challenge
    const index = first.options.findIndex((o) => o.id === first.answer)
    fireEvent.keyDown(window, { key: String(index + 1) })
    expect(screen.getByText('¡Correcto!')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByText(round[1].challenge.question)).toBeTruthy()
  })

  test('al subir de nivel de explorador, el final de la ronda lo celebra', () => {
    seed({ xp: 70 })
    const round = makeRound({ ...initialState(), xp: 70 }, 'supermercado')
    render(<App />)
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Camino de verticales' })).getByRole('button', {
        name: /^Súper: Sin sello/,
      }),
    )
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Jugar' }))
    for (const step of round) {
      if (step.type === 'descubrir') fireEvent.click(screen.getByRole('button', { name: 'Dar vuelta' }))
      else {
        const label = step.challenge.options.find((o) => o.id === step.challenge.answer).label
        fireEvent.click(within(screen.getByRole('group', { name: 'Opciones' })).getByRole('button', { name: label }))
      }
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    }
    expect(screen.getByText('¡Subiste a nivel 2!')).toBeTruthy()
    // El aviso global no repite lo que ya celebra la ronda.
    fireEvent.click(screen.getByRole('button', { name: 'Seguir' }))
    expect(screen.queryByRole('status', { name: 'Aviso' })).toBeNull()
  })
})

describe('álbum', () => {
  test('la pestaña avisa cuántas cartas quedan sin leer', () => {
    seed({ cards: FACTS.slice(0, 3).map((f) => f.id), opened: [FACTS[0].id] })
    render(<App />)
    expect(within(nav()).getByRole('button', { name: /2 cartas sin leer/ })).toBeTruthy()
  })

  test('sin cartas muestra cómo ganarlas', () => {
    seed()
    render(<App />)
    fireEvent.click(within(nav()).getByRole('button', { name: /Álbum/ }))
    expect(screen.getByText('Juega una ronda para ganar tus primeras cartas.')).toBeTruthy()
  })
})

describe('camino', () => {
  test('cada parada muestra su avance de conceptos', () => {
    const v = 'chocolateria'
    seed({
      discovered: {
        [v]: conceptsOf(v)
          .slice(0, 3)
          .map((c) => c.id),
      },
    })
    render(<App />)
    const stop = screen.getByRole('region', { name: 'Camino de verticales' }).querySelector(`[data-vertical="${v}"]`)
    expect(Number(stop.getAttribute('data-progress'))).toBeCloseTo(3 / conceptsOf(v).length)
  })

  test('el aviso se cierra solo', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    almostDone()
    render(<App />)
    fireEvent.click(within(nav()).getByRole('button', { name: /Álbum/ }))
    fireEvent.click(screen.getByRole('button', { name: `Leer carta: ${FACTS[0].title}` }))
    expect(screen.getByRole('status', { name: 'Aviso' })).toBeTruthy()
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.queryByRole('status', { name: 'Aviso' })).toBeNull()
  })
})

describe('dentro del prototipo', () => {
  test('la flecha de arriba sale del juego', () => {
    seed()
    const back = vi.fn()
    render(<App params={{ tab: 'jugar' }} back={back} />)
    fireEvent.click(screen.getByRole('button', { name: 'Volver a Rappi' }))
    expect(back).toHaveBeenCalled()
  })

  test('con `round` arranca la ronda de esa vertical', () => {
    seed()
    render(<App params={{ round: 'turbo' }} />)
    expect(screen.getByRole('progressbar', { name: 'Avance de la ronda' })).toBeTruthy()
  })

  test('con `vertical` abre su hoja; «Abrir Turbo» la sella y abre la vertical en la app', () => {
    seed()
    const push = vi.fn()
    render(<App params={{ vertical: 'turbo' }} push={push} />)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Abrir Turbo' }))
    expect(push).toHaveBeenCalledWith(...routeForScreen('turbo'))
    expect(stored().visited).toContain('turbo')
  })

  test('«Repetir escena» con una ronda a medias la empieza de nuevo', () => {
    seed()
    render(<App params={{ round: 'turbo' }} />)
    const bar = () => screen.getByRole('progressbar', { name: 'Avance de la ronda' })
    fireEvent.click(screen.getByRole('button', { name: 'Dar vuelta' }))
    expect(bar().getAttribute('aria-valuenow')).toBe('1')
    act(() => window.dispatchEvent(new Event(REPLAY_EVENT)))
    expect(bar().getAttribute('aria-valuenow')).toBe('0')
    expect(stored()?.xp ?? 0).toBe(0)
  })

  test('«Repetir escena» devuelve el juego a su pantalla de entrada', () => {
    seed()
    render(<App params={{ tab: 'jugar' }} />)
    fireEvent.click(screen.getByRole('button', { name: /^Álbum/ }))
    act(() => window.dispatchEvent(new Event(REPLAY_EVENT)))
    expect(screen.getByRole('region', { name: 'Camino de verticales' })).toBeTruthy()
  })

  test('la primera vez, abrir un sello muestra solo su hoja (sin la bienvenida encima)', () => {
    render(<App params={{ vertical: 'turbo' }} />)
    const sheets = screen.getAllByRole('dialog')
    expect(sheets).toHaveLength(1)
    expect(within(sheets[0]).getByRole('button', { name: 'Abrir Turbo' })).toBeTruthy()
  })
})
