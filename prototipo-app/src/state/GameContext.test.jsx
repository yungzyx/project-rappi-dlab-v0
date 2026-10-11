import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fixture, gameCards, gameServer, stubApi } from '../api/testing'
import { userId } from '../api/user'
import { cardsOf, datosOf, setKnowledge } from '../game/knowledge.js'
import { initialState } from '../game/progress.js'
import { gameReady, savedAs, seed, stored } from '../game/testSeed.js'
import { GameProvider, useGame } from './GameContext.jsx'
import { REPLAY_EVENT } from './liveMemory'

// Lo que dejaba el juego en el navegador antes de que el progreso viviera en el servidor.
const LOCAL_KEY = 'rappi-proto-juego-v1'
const LEGACY_KEY = 'rappi-proto-pasaporte'

beforeEach(() => localStorage.clear())
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
      <p data-testid="date">{game.date}</p>
      <p data-testid="events">{game.events.map((e) => `${e.type}:${e.value}`).join(',')}</p>
      <button type="button" onClick={() => onClick(game)}>
        actuar
      </button>
      <button type="button" onClick={() => game.dismissEvent()}>
        cerrar
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
  test('loads cards and state from the API before rendering', async () => {
    setKnowledge([])
    seed({ xp: 130 })
    const api = stubApi({ 'GET /game/cards': fixture('game-cards') })
    renderProbe()
    // Mientras carga no pinta a los hijos: solo el aviso de carga.
    expect(screen.queryByTestId('xp')).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/Conectando con/)
    await gameReady()
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

  test('shows Sin conexión with Reintentar when cards fail', async () => {
    let online = false
    stubApi({ 'GET /game/cards': () => (online ? fixture('game-cards') : 'offline') })
    renderProbe()
    expect(await screen.findByRole('heading', { name: /Sin conexión/ })).toBeTruthy()
    expect(screen.queryByTestId('xp')).toBeNull()
    online = true
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await gameReady()
    expect(screen.getByTestId('xp').textContent).toBe('0')
  })

  test('también muestra Sin conexión si falla el progreso', async () => {
    stubApi({ 'GET /game/state/*': 500 })
    renderProbe()
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeTruthy()
    expect(screen.queryByTestId('xp')).toBeNull()
  })
})

describe('progreso que quedó en el navegador', () => {
  const local = () => ({ ...initialState(), xp: 90, seenIntro: true, visited: ['turbo'] })

  test('migrates local progress once when the server has none and clears it', async () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(local()))
    localStorage.setItem(LEGACY_KEY, '["grocery"]')
    const api = stubApi({})
    renderProbe()
    await gameReady()
    expect(screen.getByTestId('xp').textContent).toBe('90')
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

  test('limpia con la validación de siempre: tarjetas que ya no existen no suben', async () => {
    const [card] = datosOf('turbo')
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify({ ...local(), cards: ['licores-tamano', card.id], discovered: { turbo: ['frutas', card.id] } }),
    )
    stubApi({})
    renderProbe()
    await gameReady()
    expect(stored()).toMatchObject({ cards: [card.id], discovered: { turbo: [card.id] }, xp: 90 })
  })

  test('el pasaporte viejo, solo, sube como verticales visitadas', async () => {
    localStorage.setItem(LEGACY_KEY, '["grocery","liquor"]')
    stubApi({})
    renderProbe()
    await gameReady()
    expect(stored().visited.sort()).toEqual(['licores', 'supermercado'])
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  })

  test('si el traspaso falla, el progreso del navegador se conserva para el próximo intento', async () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(local()))
    stubApi({ 'PUT /game/state/*': 'offline' })
    renderProbe()
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY)).xp).toBe(90)
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
