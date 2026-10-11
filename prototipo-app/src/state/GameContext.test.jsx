import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fixture, gameCards, gameServer, stubApi } from '../api/testing'
import { userId } from '../api/user'
import { cardsOf, datosOf, preguntasOf, setKnowledge } from '../game/knowledge.js'
import { initialState } from '../game/progress.js'
import { gameReady, savedAs, seed, stored } from '../game/testSeed.js'
import { GameProvider, useGame } from './GameContext.jsx'
import { REPLAY_EVENT } from './liveMemory'

// Lo que dejaba el juego en el navegador antes de que el progreso viviera en el servidor.
const events = vi.hoisted(() => ({ track: vi.fn(), flush: async () => {}, clear: () => {}, settled: async () => {} }))
vi.mock('./EventsContext', async (importOriginal) => ({ ...(await importOriginal()), useEvents: () => events }))

const LOCAL_KEY = 'rappi-proto-juego-v1'
const LEGACY_KEY = 'rappi-proto-pasaporte'

beforeEach(() => {
  localStorage.clear()
  events.track.mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setKnowledge(gameCards()) // las pruebas de carga lo dejan con lo que dio la respuesta de ejemplo
})

function Probe({ onClick }) {
  const game = useGame()
  return (
    <>
      <p data-testid="xp">{game.state.xp}</p>
      <p data-testid="status">{game.status}</p>
      <p data-testid="date">{game.date}</p>
      <p data-testid="events">{game.events.map((e) => `${e.type}:${e.value}`).join(',')}</p>
      <button type="button" onClick={() => onClick(game)}>
        actuar
      </button>
      <button type="button" onClick={() => game.dismissEvent()}>
        cerrar
      </button>
      <button type="button" onClick={() => game.retry()}>
        reintentar
      </button>
    </>
  )
}

const renderProbe = (onClick = () => {}) =>
  render(
    <GameProvider>
      <Probe onClick={onClick} />
    </GameProvider>,
  )

const requests = (fetchMock, method) =>
  fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === method).map(([url]) => new URL(url).pathname)

describe('carga desde la API', () => {
  test('loads cards and state from the API while its children are already on screen', async () => {
    setKnowledge([])
    seed({ xp: 130 })
    const api = stubApi({ 'GET /game/cards': fixture('game-cards') })
    renderProbe()
    // La app no espera al juego: los hijos se pintan de una vez, con el estado en cero y status «loading».
    expect(screen.getByTestId('status').textContent).toBe('loading')
    expect(screen.getByTestId('xp').textContent).toBe('0')
    expect(screen.queryByRole('status')).toBeNull() // el aviso de conexión ya no vive aquí: lo muestran las pantallas del juego
    await gameReady()
    expect(screen.getByTestId('status').textContent).toBe('ready')
    expect(screen.getByTestId('xp').textContent).toBe('130')
    expect(cardsOf('supermercado')).toHaveLength(12)
    expect(requests(api, 'GET')).toEqual(['/game/cards', `/game/state/${userId()}`])
  })

  test('sin progreso en el servidor (204) parte en cero y no guarda nada todavía', async () => {
    const api = stubApi({})
    renderProbe()
    await gameReady()
    expect(screen.getByTestId('xp').textContent).toBe('0')
    expect(requests(api, 'PUT')).toEqual([])
  })

  test('cuando fallan las tarjetas queda offline sin tapar a los hijos, y retry vuelve a intentar', async () => {
    let online = false
    stubApi({ 'GET /game/cards': () => (online ? fixture('game-cards') : 'offline') })
    renderProbe()
    await gameReady()
    expect(screen.getByTestId('status').textContent).toBe('offline')
    expect(screen.getByTestId('xp')).toBeTruthy()
    online = true
    fireEvent.click(screen.getByText('reintentar'))
    expect(screen.getByTestId('status').textContent).toBe('loading')
    await gameReady()
    expect(screen.getByTestId('status').textContent).toBe('ready')
  })

  test('también queda offline si falla el progreso', async () => {
    stubApi({ 'GET /game/state/*': 500 })
    renderProbe()
    await gameReady()
    expect(screen.getByTestId('status').textContent).toBe('offline')
  })

  test('fuera de «ready» las acciones no hacen nada: ni progreso, ni guardado, ni eventos', async () => {
    const [a] = datosOf('turbo')
    const api = stubApi({ 'GET /game/cards': 500 })
    let visited
    renderProbe((game) => {
      game.discover('turbo', a.id)
      game.answer('turbo', true, a.id)
      game.openCard(a.id)
      game.seeIntro()
      visited = game.visit('grocery')
    })
    await gameReady()
    fireEvent.click(screen.getByText('actuar'))
    await act(async () => {})
    expect(screen.getByTestId('xp').textContent).toBe('0')
    expect(visited).toBe(false)
    expect(requests(api, 'PUT')).toEqual([])
    expect(events.track).not.toHaveBeenCalled()
  })
})

describe('progreso que quedó en el navegador', () => {
  // Las tarjetas que el progreso viejo nombra (el servidor es quien sabe cuáles existen todavía).
  const [d1, d2] = gameCards().filter((c) => c.vertical === 'turbo' && c.kind === 'dato')
  const local = () => ({
    ...initialState(),
    xp: 90,
    seenIntro: true,
    visited: ['turbo'],
    discovered: { turbo: [d1.id, d2.id] },
    cards: [d1.id],
    opened: [d1.id],
  })
  // Como en producción: al leer el progreso viejo el registro de tarjetas todavía está vacío (llegan de la API después).
  beforeEach(() => setKnowledge([]))

  test('migrates local progress once when the server has none and clears it', async () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(local()))
    localStorage.setItem(LEGACY_KEY, '["grocery"]')
    const api = stubApi({})
    renderProbe()
    await gameReady()
    expect(screen.getByTestId('xp').textContent).toBe('90')
    // Sube el progreso entero: las tarjetas descubiertas, del álbum y abiertas llegan al servidor.
    expect(stored()).toEqual(local())
    expect(requests(api, 'PUT')).toEqual([`/game/state/${userId()}`])
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull()
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()

    // Una segunda vez ya no hay nada que traspasar: el servidor tiene su estado y no se vuelve a subir.
    cleanup()
    renderProbe()
    await gameReady()
    expect(screen.getByTestId('xp').textContent).toBe('90')
    expect(requests(api, 'PUT')).toHaveLength(1)
  })

  test('sube exactamente la forma del servidor: sin claves de más, con números enteros y lo que falta completado', async () => {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify({
        ...local(),
        extra: 'x',
        xp: 90.7,
        correct: { turbo: 2.9, licores: -1 },
        answered: { turbo: 3 },
        daily: { date: '2026-10-09', discovered: 2, correct: 1.5, opened: 0, done: true, viejo: 1 },
        streak: { count: 3, lastDate: '2026-10-09', best: 9 },
        discovered: { turbo: [d1.id, 'x'.repeat(65)] },
      }),
    )
    stubApi({})
    renderProbe()
    await gameReady()
    expect(stored()).toEqual({
      ...local(),
      xp: 90,
      correct: { turbo: 2, licores: 0 },
      answered: { turbo: 3 },
      daily: { date: '2026-10-09', discovered: 2, correct: 1, opened: 0, done: true },
      streak: { count: 3, lastDate: '2026-10-09' },
      discovered: { turbo: [d1.id] },
    })
  })

  test('lo que falta en el progreso viejo se completa con el estado inicial', async () => {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify({ version: 1, xp: 5, discovered: {}, correct: {}, answered: {}, cards: [], opened: [] }),
    )
    stubApi({})
    renderProbe()
    await gameReady()
    expect(stored()).toEqual({ ...initialState(), xp: 5 })
  })

  test('el pasaporte viejo, solo, sube como verticales visitadas', async () => {
    localStorage.setItem(LEGACY_KEY, '["grocery","liquor"]')
    stubApi({})
    renderProbe()
    await gameReady()
    expect(stored().visited.sort()).toEqual(['licores', 'supermercado'])
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  })

  test.each(['offline', 500])('si el traspaso falla (%s), el progreso del navegador se conserva para el próximo intento', async (failure) => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(local()))
    stubApi({ 'PUT /game/state/*': failure })
    renderProbe()
    await gameReady()
    expect(screen.getByTestId('status').textContent).toBe('offline')
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY)).xp).toBe(90)
  })

  test.each([422, 409])('un %s en el traspaso no bloquea la app: se salta, avisa y deja lo local intacto', async (status) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(LOCAL_KEY, JSON.stringify(local()))
    localStorage.setItem(LEGACY_KEY, '["grocery"]')
    stubApi({ 'PUT /game/state/*': status })
    renderProbe()
    await gameReady()
    expect(screen.getByTestId('status').textContent).toBe('ready')
    expect(screen.getByTestId('xp').textContent).toBe('0') // parte en cero
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/traspas/i), expect.anything())
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY)).xp).toBe(90)
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull()
    warn.mockRestore()
  })

  test('under StrictMode the load runs twice but uploads the progress once', async () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(local()))
    const api = stubApi({})
    render(
      <StrictMode>
        <GameProvider>
          <Probe onClick={() => {}} />
        </GameProvider>
      </StrictMode>,
    )
    await gameReady()
    expect(screen.getByTestId('xp').textContent).toBe('90')
    expect(requests(api, 'PUT')).toHaveLength(1)
    expect(requests(api, 'GET').filter((path) => path === '/game/cards')).toHaveLength(1)
    expect(stored()).toEqual(local())
  })

  test('server progress wins over local progress and local is cleared', async () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...local(), xp: 500 }))
    localStorage.setItem(LEGACY_KEY, '["grocery"]')
    seed({ xp: 130 })
    const api = stubApi({})
    renderProbe()
    await gameReady()
    expect(screen.getByTestId('xp').textContent).toBe('130')
    expect(requests(api, 'PUT')).toEqual([])
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull()
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  })

  test('el juego nunca escribe su progreso en el navegador', async () => {
    const set = vi.spyOn(Storage.prototype, 'setItem')
    stubApi({})
    renderProbe((game) => game.discover('turbo', datosOf('turbo')[0].id))
    await gameReady()
    set.mockClear() // el id del usuario sí vive en el navegador; el progreso, no
    fireEvent.click(screen.getByText('actuar'))
    await savedAs((s) => expect(s.xp).toBe(10))
    expect(set).not.toHaveBeenCalled()
    set.mockRestore()
  })
})

describe('guardado en el servidor', () => {
  test('each action saves the new state to the server', async () => {
    const [a] = datosOf('turbo')
    const api = stubApi({})
    renderProbe((game) => game.discover('turbo', a.id))
    await gameReady()
    fireEvent.click(screen.getByText('actuar'))
    expect(screen.getByTestId('xp').textContent).toBe('10')
    await savedAs((s) => expect(s).toMatchObject({ xp: 10, discovered: { turbo: [a.id] } }))
    expect(requests(api, 'PUT')).toEqual([`/game/state/${userId()}`])
  })

  test('reset saves the initial state', async () => {
    seed({ xp: 130 })
    stubApi({})
    renderProbe()
    await gameReady()
    act(() => window.dispatchEvent(new Event(REPLAY_EVENT)))
    expect(screen.getByTestId('xp').textContent).toBe('0')
    await savedAs((s) => expect(s).toEqual(initialState()))
    expect(gameServer.state).toEqual(initialState())
  })

  test('an action that leaves the state as it was saves nothing (opening an already-stamped vertical)', async () => {
    seed({ visited: ['supermercado'] })
    const api = stubApi({})
    renderProbe((game) => game.visit('grocery'))
    await gameReady()
    fireEvent.click(screen.getByText('actuar'))
    await act(async () => {})
    expect(requests(api, 'PUT')).toEqual([])
  })

  test('forget goes back to the initial state without saving; the next action saves the fresh state', async () => {
    const [a] = datosOf('turbo')
    seed({ xp: 130, visited: ['farmacia'] })
    const api = stubApi({})
    let forgotten = false
    renderProbe((game) => {
      if (forgotten) return game.discover('turbo', a.id)
      forgotten = true
      return game.forget()
    })
    await gameReady()
    expect(screen.getByTestId('xp').textContent).toBe('130')
    fireEvent.click(screen.getByText('actuar'))
    expect(screen.getByTestId('xp').textContent).toBe('0')
    await act(async () => {})
    expect(requests(api, 'PUT')).toEqual([])

    fireEvent.click(screen.getByText('actuar'))
    await savedAs((s) => expect(s).toMatchObject({ xp: 10, visited: initialState().visited, discovered: { turbo: [a.id] } }))
    expect(requests(api, 'PUT')).toEqual([`/game/state/${userId()}`])
  })

  test('settle waits for the save in flight and drops the queued one; the next action saves again', async () => {
    const [a, b, c] = datosOf('turbo')
    const api = stubApi({ 'PUT /game/state/*': { slow: 40, body: { state: initialState() } } })
    const ids = [a.id, b.id, c.id]
    let step = 0
    let game
    renderProbe((current) => {
      game = current
      return current.discover('turbo', ids[step++])
    })
    await gameReady()
    fireEvent.click(screen.getByText('actuar')) // sale el primero (en vuelo)
    fireEvent.click(screen.getByText('actuar')) // el segundo queda en cola
    expect(requests(api, 'PUT')).toHaveLength(1)

    let settled = false
    const settling = game.settle().then(() => (settled = true))
    await act(async () => {})
    expect(settled).toBe(false) // el PUT en vuelo no ha terminado
    await act(async () => {
      await settling
    })
    act(() => game.forget())
    await act(async () => {})
    expect(requests(api, 'PUT')).toHaveLength(1) // el segundo nunca sale, ni después de olvidar

    fireEvent.click(screen.getByText('actuar')) // una acción real después guarda como siempre
    await act(async () => {})
    expect(requests(api, 'PUT')).toHaveLength(2)
  })

  test('«Repetir escena» mientras carga no hace nada', async () => {
    seed({ xp: 130 })
    const api = stubApi({ 'GET /game/state/*': { slow: 30, body: { state: { ...initialState(), xp: 130 } } } })
    renderProbe()
    act(() => window.dispatchEvent(new Event(REPLAY_EVENT)))
    await gameReady()
    expect(screen.getByTestId('xp').textContent).toBe('130')
    expect(requests(api, 'PUT')).toEqual([])
  })

  test('a failed save keeps the progress on screen', async () => {
    const [a, b] = datosOf('turbo')
    let online = false
    stubApi({
      'PUT /game/state/*': (req) => {
        if (!online) return 'offline'
        gameServer.puts.push(req.body.state)
        return { state: req.body.state }
      },
    })
    renderProbe((game) => game.discover('turbo', game.state.discovered.turbo?.length ? b.id : a.id))
    await gameReady()
    fireEvent.click(screen.getByText('actuar'))
    expect(screen.getByTestId('xp').textContent).toBe('10')
    await act(async () => {}) // deja pasar el fallo
    expect(screen.getByTestId('xp').textContent).toBe('10')
    expect(stored()).toBeNull()

    // El próximo guardado lleva el estado más nuevo, incluido lo que no se había podido enviar.
    online = true
    fireEvent.click(screen.getByText('actuar'))
    expect(screen.getByTestId('xp').textContent).toBe('20')
    await savedAs((s) => expect(s).toMatchObject({ xp: 20, discovered: { turbo: [a.id, b.id] } }))
  })
})

describe('guardado que se reintenta solo', () => {
  const puts = (api) => api.mock.calls.filter(([, init]) => init?.method === 'PUT')

  test('un guardado fallido se reintenta sin otra acción', async () => {
    const [a] = datosOf('turbo')
    vi.useFakeTimers()
    let online = false
    stubApi({
      'PUT /game/state/*': (req) => {
        if (!online) return 'offline'
        gameServer.puts.push(req.body.state)
        return { state: req.body.state }
      },
    })
    renderProbe((game) => game.discover('turbo', a.id))
    await gameReady()
    fireEvent.click(screen.getByText('actuar'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(stored()).toBeNull()
    online = true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(stored()).toMatchObject({ xp: 10 })
  })

  test.each([
    ['online', () => window],
    ['visibilitychange', () => document],
  ])('al disparar %s reenvía lo pendiente', async (type, target) => {
    const [a] = datosOf('turbo')
    let online = false
    stubApi({
      'PUT /game/state/*': (req) => {
        if (!online) return 'offline'
        gameServer.puts.push(req.body.state)
        return { state: req.body.state }
      },
    })
    renderProbe((game) => game.discover('turbo', a.id))
    await gameReady()
    fireEvent.click(screen.getByText('actuar'))
    await act(async () => {})
    expect(stored()).toBeNull()
    online = true
    act(() => target().dispatchEvent(new Event(type)))
    await savedAs((s) => expect(s).toMatchObject({ xp: 10 }))
  })

  test('pagehide manda el estado con keepalive si quedó algo sin guardar', async () => {
    const [a] = datosOf('turbo')
    const api = stubApi({ 'PUT /game/state/*': 'offline' })
    renderProbe((game) => game.discover('turbo', a.id))
    await gameReady()
    fireEvent.click(screen.getByText('actuar'))
    await act(async () => {})
    const before = puts(api).length
    window.dispatchEvent(new Event('pagehide'))
    const sent = puts(api).slice(before)
    expect(sent).toHaveLength(1)
    expect(sent[0][1].keepalive).toBe(true)
    expect(new URL(sent[0][0]).pathname).toBe(`/game/state/${userId()}`)
    expect(JSON.parse(sent[0][1].body).state).toMatchObject({ xp: 10, discovered: { turbo: [a.id] } })
  })

  test('pagehide sin nada pendiente no manda nada', async () => {
    const [a] = datosOf('turbo')
    const api = stubApi({})
    renderProbe((game) => game.discover('turbo', a.id))
    await gameReady()
    fireEvent.click(screen.getByText('actuar'))
    await savedAs((s) => expect(s).toMatchObject({ xp: 10 }))
    const before = puts(api).length
    window.dispatchEvent(new Event('pagehide'))
    expect(puts(api)).toHaveLength(before)
  })
})

describe('estado del juego', () => {
  test('dos acciones en el mismo toque no se pisan', async () => {
    const [a, b] = datosOf('turbo')
    stubApi({})
    renderProbe((game) => {
      game.discover('turbo', a.id)
      game.discover('turbo', b.id)
    })
    await gameReady()
    fireEvent.click(screen.getByText('actuar'))
    expect(screen.getByTestId('xp').textContent).toBe('20')
    // La primera petición lleva el primer estado; el servidor termina con el último.
    await savedAs((s) => expect(s.discovered.turbo).toEqual([a.id, b.id]))
  })

  test('la fecha cambia sola pasada la medianoche', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date(2026, 9, 8, 23, 59, 30))
    stubApi({})
    renderProbe()
    await gameReady()
    expect(screen.getByTestId('date').textContent).toBe('2026-10-08')
    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByTestId('date').textContent).toBe('2026-10-09')
  })

  test('avisa al completar la misión del día y al subir de nivel', async () => {
    const [a, b, c] = datosOf('supermercado')
    const card = c.id // una tarjeta que ya estaba en el álbum
    seed({ ...initialState(), xp: 50, cards: [card] })
    stubApi({})
    renderProbe((game) => {
      game.discover('supermercado', a.id)
      game.discover('supermercado', b.id)
      game.answer('supermercado', true)
      game.openCard(card)
    })
    await gameReady()
    fireEvent.click(screen.getByText('actuar'))
    // 50 + 10 + 10 + 20 = 90; la misión suma 50 → 140: nivel 2.
    expect(screen.getByTestId('xp').textContent).toBe('140')
    expect(screen.getByTestId('events').textContent).toBe('mision:50,nivel:2')
    fireEvent.click(screen.getByText('cerrar'))
    expect(screen.getByTestId('events').textContent).toBe('nivel:2')
  })
})

describe('eventos de tarjetas descubiertas', () => {
  const discovered = () => events.track.mock.calls.filter(([type]) => type === 'game_card_discovered')

  test('a new card sends game_card_discovered once', async () => {
    const [a] = datosOf('turbo')
    seed()
    stubApi({})
    renderProbe((game) => game.discover('turbo', a.id))
    await gameReady()
    fireEvent.click(screen.getByRole('button', { name: 'actuar' }))
    fireEvent.click(screen.getByRole('button', { name: 'actuar' }))
    expect(discovered()).toEqual([['game_card_discovered', { payload: { vertical_juego: 'turbo', tarjeta: a.id } }]])
  })

  test('seeing a known card again sends nothing', async () => {
    const [a, b] = datosOf('turbo')
    seed({ discovered: { turbo: [a.id] }, cards: [b.id] })
    stubApi({})
    renderProbe((game) => {
      game.discover('turbo', a.id)
      game.discover('turbo', b.id) // ya está en el álbum aunque no figure como descubierta
    })
    await gameReady()
    fireEvent.click(screen.getByRole('button', { name: 'actuar' }))
    expect(discovered()).toEqual([])
  })

  test('a correct new pregunta sends the event; a wrong or repeated answer does not', async () => {
    const [q] = preguntasOf('turbo')
    seed()
    stubApi({})
    const answers = [false, true, true]
    renderProbe((game) => game.answer('turbo', answers.shift(), q.id))
    await gameReady()
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'actuar' }))
    expect(discovered()).toEqual([['game_card_discovered', { payload: { vertical_juego: 'turbo', tarjeta: q.id } }]])
  })

  test('a challenge without card sends nothing', async () => {
    seed()
    stubApi({})
    renderProbe((game) => game.answer('turbo', true))
    await gameReady()
    fireEvent.click(screen.getByRole('button', { name: 'actuar' }))
    expect(events.track).not.toHaveBeenCalled()
  })
})
