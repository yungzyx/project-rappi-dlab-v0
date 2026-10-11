// «Olvidar» con el juego de verdad (GameProvider y su guardado), no un doble: pausa el guardado hasta el DELETE.
import { useEffect } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fixture, gameServer, resetGameServer, stubApi } from '../../api/testing'
import { datosOf } from '../../game/knowledge.js'
import { gameReady, seed } from '../../game/testSeed.js'
import { AssistantProvider, useAssistant } from '../../state/AssistantContext'
import { CartProvider } from '../../state/CartContext'
import { DemoProvider } from '../../state/DemoContext'
import { GameProvider, useGame } from '../../state/GameContext'
import { ProductSheetProvider } from '../../state/ProductSheetContext'
import { ProfileProvider } from '../../state/ProfileContext'
import AssistantPanel from './AssistantPanel'

const events = vi.hoisted(() => ({ track: vi.fn(), flush: vi.fn(), clear: vi.fn(), settled: vi.fn() }))
vi.mock('../../state/EventsContext', async (importOriginal) => ({ ...(await importOriginal()), useEvents: () => events }))

const probe = {}
function Probe() {
  const game = useGame()
  useEffect(() => {
    probe.game = game
  })
  return null
}
function OpenButton() {
  const assistant = useAssistant()
  return (
    <button type="button" onClick={() => assistant.open()}>
      abrir
    </button>
  )
}

const advance = (ms) => act(() => vi.advanceTimersByTimeAsync(ms))
async function runUntilIdle() {
  await advance(0)
  for (let i = 0; i < 100 && vi.getTimerCount() > 0; i++) await advance(250)
}
const discover = (index) => act(() => probe.game.discover('turbo', datosOf('turbo')[index].id))

async function renderPanel(deleteResponse) {
  stubApi({
    '/catalog/home': fixture('catalog-home'),
    '/profile/*': { interests: [{ concept: 'vino', label: '🍷 Vino' }] },
    'DELETE /profile/*': { slow: 300, body: deleteResponse },
  })
  render(
    <DemoProvider>
      <ProfileProvider>
        <AssistantProvider>
          <CartProvider>
            <ProductSheetProvider>
              <GameProvider>
                <Probe />
                <OpenButton />
                <AssistantPanel push={() => {}} />
              </GameProvider>
            </ProductSheetProvider>
          </CartProvider>
        </AssistantProvider>
      </ProfileProvider>
    </DemoProvider>,
  )
  await gameReady()
  fireEvent.click(screen.getByText('abrir'))
  await runUntilIdle()
}

beforeEach(() => {
  vi.useFakeTimers()
  resetGameServer()
  seed({})
  events.settled.mockResolvedValue(undefined)
  window.history.replaceState(null, '', '/')
  Element.prototype.scrollTo = () => {}
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  delete Element.prototype.scrollTo
  localStorage.clear()
  sessionStorage.clear()
})

describe('Olvidar pausa el guardado del juego', () => {
  test('nothing is saved while the DELETE is in flight, and the next real action saves the fresh state', async () => {
    await renderPanel({})
    fireEvent.click(screen.getByText('Olvidar'))
    await advance(50) // el DELETE va en camino: el juego ya está pausado
    await discover(0) // el progreso se ve en pantalla...
    expect(probe.game.state.xp).toBe(10)
    await advance(100)
    expect(gameServer.puts).toEqual([]) // ...pero no sube nada: recrearía al usuario

    await runUntilIdle()
    expect(probe.game.state.xp).toBe(0) // borrado el perfil, el juego vuelve a cero
    expect(gameServer.puts).toEqual([])

    await discover(1) // una acción real después guarda como siempre
    await advance(50)
    expect(gameServer.puts).toHaveLength(1)
    expect(gameServer.puts[0]).toMatchObject({ xp: 10 })
  })

  test('if the DELETE fails, the game resumes and saves its current state once', async () => {
    await renderPanel(500)
    fireEvent.click(screen.getByText('Olvidar'))
    await advance(50)
    await discover(0)
    await advance(100)
    expect(gameServer.puts).toEqual([])

    await runUntilIdle()
    expect(screen.getAllByText(/No pude borrar lo aprendido/).length).toBeGreaterThan(0)
    expect(probe.game.state.xp).toBe(10) // el juego no cambió: el servidor sigue con su perfil
    expect(gameServer.puts).toHaveLength(1)
    expect(gameServer.puts[0]).toMatchObject({ xp: 10 })
  })
})
