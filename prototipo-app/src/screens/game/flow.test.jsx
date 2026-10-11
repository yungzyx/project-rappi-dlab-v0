import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { gameChallenge, stubApi } from '../../api/testing'
import { GameApp as App, mount } from './GameApp.testkit.jsx'
import { cardsOf, datosOf } from '../../game/knowledge.js'
import { initialState, today } from '../../game/progress.js'
import { makeRound } from '../../game/round.js'
import { seed, stored } from '../../game/testSeed.js'
import { routeForScreen } from '../../data/verticals'
import { REPLAY_EVENT, session } from '../../state/liveMemory'

beforeEach(() => {
  localStorage.clear()
  stubApi({})
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** La ronda como la arma la app con el desafío que responde la API. */
const roundOf = (state, vertical) =>
  makeRound(state, vertical, gameChallenge(vertical, String(state.answered[vertical] ?? 0)))
const roundLoaded = () => screen.findByRole('progressbar', { name: 'Avance de la ronda' })

const nav = () => screen.getByRole('navigation')
// Misión de hoy casi lista: 2 datos y 1 acierto; falta abrir una tarjeta (una ya ganada).
const CARD = datosOf('supermercado')[0]
const almostDone = () =>
  seed({ cards: [CARD.id], daily: { date: today(), discovered: 2, correct: 1, opened: 0, done: false } })

describe('bienvenida', () => {
  test('la primera vez Mochi da la bienvenida y «Empezar» abre la primera ronda', async () => {
    await mount(<App />)
    const intro = screen.getByRole('dialog', { name: 'Bienvenida' })
    fireEvent.click(within(intro).getByRole('button', { name: 'Empezar' }))
    expect(await screen.findByText('¿Sabías que…?')).toBeTruthy()
    await waitFor(() => expect(stored().seenIntro).toBe(true))
  })

  test('con la bienvenida vista no vuelve a aparecer', async () => {
    seed()
    await mount(<App />)
    expect(screen.queryByRole('dialog', { name: 'Bienvenida' })).toBeNull()
  })
})

describe('misión del día', () => {
  test('el cofre se puede tocar: explica qué falta y lleva a jugar', async () => {
    seed()
    await mount(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Misión del día/ }))
    const sheet = screen.getByRole('dialog', { name: 'Misión del día' })
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(3)
    fireEvent.click(within(sheet).getByRole('button', { name: 'Jugar ahora' }))
    expect(await roundLoaded()).toBeTruthy()
  })

  test('completarla fuera de una ronda muestra un aviso con la racha', async () => {
    almostDone()
    await mount(<App />)
    fireEvent.click(within(nav()).getByRole('button', { name: /Álbum/ }))
    fireEvent.click(screen.getByRole('button', { name: `Leer tarjeta: ${CARD.title}` }))
    const toast = screen.getByRole('status', { name: 'Aviso' })
    expect(within(toast).getByText('¡Misión del día completa!')).toBeTruthy()
    expect(within(toast).getByText('+50 XP · racha de 1 día')).toBeTruthy()
    await waitFor(() => expect(stored().daily.done).toBe(true))
  })
})

describe('ronda', () => {
  test('pedir salir confirma antes', async () => {
    seed()
    await mount(<App />)
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Camino de verticales' })).getByRole('button', {
        name: /^Turbo: Sin sello/,
      }),
    )
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Jugar' }))
    await roundLoaded()
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }))
    expect(screen.getByRole('dialog', { name: '¿Salir de la ronda?' })).toBeTruthy()
  })

  test('se juega con el teclado: Enter da vuelta y sigue, 1 a 4 responden', async () => {
    const all = cardsOf('chocolateria').map((c) => c.id)
    seed({ discovered: { chocolateria: all } })
    const round = roundOf({ ...initialState(), discovered: { chocolateria: all } }, 'chocolateria')
    await mount(<App />)
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Camino de verticales' })).getByRole('button', {
        name: /^Chocolatería: Explorador/,
      }),
    )
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Jugar' }))
    await roundLoaded()
    fireEvent.keyDown(window, { key: 'Enter' }) // da vuelta el dato
    expect(screen.getByText(round[0].card.text)).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Enter' }) // sigue
    const question = round[1].challenge
    const index = question.options.findIndex((o) => o.id === question.answer)
    fireEvent.keyDown(window, { key: String(index + 1) })
    expect(screen.getByText('¡Correcto!')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByText('¿Sabías que…?')).toBeTruthy()
  })

  test('Enter sobre la X en un paso de dato no da vuelta la carta ni suma XP: deja que el botón salga', async () => {
    seed()
    await mount(<App params={{ round: 'turbo' }} />)
    await roundLoaded()
    const exit = screen.getByRole('button', { name: 'Salir' })
    const untouched = fireEvent.keyDown(exit, { key: 'Enter' }) // false si alguien le quitó la acción nativa
    expect(untouched).toBe(true)
    expect(screen.getByRole('button', { name: 'Dar vuelta' })).toBeTruthy()
    fireEvent.click(exit) // la activación nativa de Enter sobre un botón es este clic
    expect(screen.getByRole('dialog', { name: '¿Salir de la ronda?' })).toBeTruthy()
  })

  test('Escape en la ronda pide confirmar y Escape de nuevo cierra solo la confirmación', async () => {
    seed()
    await mount(<App params={{ round: 'turbo' }} />)
    await roundLoaded()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: '¿Salir de la ronda?' })).toBeTruthy()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '¿Salir de la ronda?' })).toBeNull()
    expect(screen.getByRole('progressbar', { name: 'Avance de la ronda' })).toBeTruthy()
  })

  test('la confirmación de salir no roba el foco al re-renderizar y lo devuelve a la X al cerrar', async () => {
    seed()
    await mount(<App params={{ round: 'turbo' }} />)
    await roundLoaded()
    const exit = screen.getByRole('button', { name: 'Salir' })
    exit.focus()
    fireEvent.click(exit)
    const keep = screen.getByRole('button', { name: 'Seguir jugando' })
    keep.focus()
    // Un re-render del padre (el tic de fecha, un toque en el progreso) no mueve el foco.
    act(() => window.dispatchEvent(new Event('resize')))
    fireEvent.keyDown(window, { key: '3' })
    expect(document.activeElement).toBe(keep)
    fireEvent.click(keep)
    expect(document.activeElement).toBe(exit)
  })

  test('al subir de nivel de explorador, el final de la ronda lo celebra', async () => {
    seed({ xp: 70 })
    const round = roundOf({ ...initialState(), xp: 70 }, 'supermercado')
    await mount(<App />)
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Camino de verticales' })).getByRole('button', {
        name: /^Súper: Sin sello/,
      }),
    )
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Jugar' }))
    await roundLoaded()
    for (const step of round) {
      if (step.type === 'dato') fireEvent.click(screen.getByRole('button', { name: 'Dar vuelta' }))
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
  test('la pestaña avisa cuántas cartas quedan sin leer', async () => {
    const [a, b, c] = datosOf('turbo').map((card) => card.id)
    seed({ cards: [a, b, c], opened: [a] })
    await mount(<App />)
    expect(within(nav()).getByRole('button', { name: /2 cartas sin leer/ })).toBeTruthy()
  })

  test('sin cartas muestra cómo ganarlas', async () => {
    seed()
    await mount(<App />)
    fireEvent.click(within(nav()).getByRole('button', { name: /Álbum/ }))
    expect(screen.getByText('Juega una ronda para ganar tus primeras tarjetas.')).toBeTruthy()
  })
})

describe('camino', () => {
  test('cada parada muestra su avance de tarjetas', async () => {
    const v = 'chocolateria'
    seed({
      discovered: {
        [v]: cardsOf(v)
          .slice(0, 3)
          .map((c) => c.id),
      },
    })
    await mount(<App />)
    const stop = screen.getByRole('region', { name: 'Camino de verticales' }).querySelector(`[data-vertical="${v}"]`)
    expect(Number(stop.getAttribute('data-progress'))).toBeCloseTo(3 / 12)
  })

  test('el aviso se cierra solo', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    almostDone()
    await mount(<App />)
    fireEvent.click(within(nav()).getByRole('button', { name: /Álbum/ }))
    fireEvent.click(screen.getByRole('button', { name: `Leer tarjeta: ${CARD.title}` }))
    expect(screen.getByRole('status', { name: 'Aviso' })).toBeTruthy()
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.queryByRole('status', { name: 'Aviso' })).toBeNull()
  })
})

describe('dentro del prototipo', () => {
  test('la flecha de arriba sale del juego', async () => {
    seed()
    const back = vi.fn()
    await mount(<App params={{ tab: 'jugar' }} back={back} />)
    fireEvent.click(screen.getByRole('button', { name: 'Volver a Rappi' }))
    expect(back).toHaveBeenCalled()
  })

  test('con `round` arranca la ronda de esa vertical', async () => {
    seed()
    await mount(<App params={{ round: 'turbo' }} />)
    expect(screen.getByRole('progressbar', { name: 'Avance de la ronda' })).toBeTruthy()
  })

  test('con `vertical` abre su hoja; «Abrir Turbo» la sella y abre la vertical en la app', async () => {
    seed()
    const push = vi.fn()
    await mount(<App params={{ vertical: 'turbo' }} push={push} />)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Abrir Turbo' }))
    expect(push).toHaveBeenCalledWith(...routeForScreen('turbo'))
    await waitFor(() => expect(stored().visited).toContain('turbo'))
  })

  test('«Abrir Viajes» la sella y abre RappiTravel (no una pantalla vacía)', async () => {
    seed()
    const push = vi.fn()
    await mount(<App params={{ vertical: 'viajes' }} push={push} />)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Abrir Viajes' }))
    expect(push).toHaveBeenCalledWith('travel')
    await waitFor(() => expect(stored().visited).toContain('viajes'))
  })

  test('el sello que gana «Abrir Turbo» queda para que Mochi lo celebre al volver a la Home', async () => {
    seed()
    session.newStamp = null
    await mount(<App params={{ vertical: 'turbo' }} push={vi.fn()} />)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Abrir Turbo' }))
    expect(session.newStamp).toBe('turbo')
    session.newStamp = null
  })

  test('«Repetir escena» con una ronda a medias la empieza de nuevo', async () => {
    seed()
    await mount(<App params={{ round: 'turbo' }} />)
    const bar = () => screen.getByRole('progressbar', { name: 'Avance de la ronda' })
    await roundLoaded()
    fireEvent.click(screen.getByRole('button', { name: 'Dar vuelta' }))
    expect(bar().getAttribute('aria-valuenow')).toBe('1')
    act(() => window.dispatchEvent(new Event(REPLAY_EVENT)))
    await roundLoaded() // la ronda nueva vuelve a pedir su desafío
    expect(bar().getAttribute('aria-valuenow')).toBe('0')
    await waitFor(() => expect(stored()?.xp).toBe(0)) // lo último que guardó es el estado inicial
  })

  test('«Repetir escena» devuelve el juego a su pantalla de entrada', async () => {
    seed()
    await mount(<App params={{ tab: 'jugar' }} />)
    fireEvent.click(screen.getByRole('button', { name: /^Álbum/ }))
    act(() => window.dispatchEvent(new Event(REPLAY_EVENT)))
    expect(screen.getByRole('region', { name: 'Camino de verticales' })).toBeTruthy()
  })

  test('la primera vez, abrir un sello muestra solo su hoja (sin la bienvenida encima)', async () => {
    await mount(<App params={{ vertical: 'turbo' }} />)
    const sheets = screen.getAllByRole('dialog')
    expect(sheets).toHaveLength(1)
    expect(within(sheets[0]).getByRole('button', { name: 'Abrir Turbo' })).toBeTruthy()
  })
})
