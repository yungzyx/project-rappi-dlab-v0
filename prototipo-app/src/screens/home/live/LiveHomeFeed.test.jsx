import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

const events = vi.hoisted(() => ({ track: vi.fn(), flush: async () => {}, clear: () => {}, settled: async () => {} }))
vi.mock('../../../state/EventsContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useEvents: () => events,
}))

// La memoria de la escena vive en el módulo (lo que dura la pestaña): cada test, una pestaña nueva.
let HomeScreen
let Providers
let memory
beforeEach(async () => {
  vi.resetModules()
  localStorage.setItem('rappi-proto-demo-mode', 'vivo')
  await import('../../../state/EventsContext')
  const demo = await import('../../../state/DemoContext')
  const profile = await import('../../../state/ProfileContext')
  const assistant = await import('../../../state/AssistantContext')
  const cart = await import('../../../state/CartContext')
  const address = await import('../../../state/AddressContext')
  const toast = await import('../../../components/Toast')
  const nudge = await import('../../../state/NudgeContext')
  memory = await import('./memory')
  HomeScreen = (await import('../HomeScreen')).default
  Providers = function Providers({ children }) {
    return (
      <demo.DemoProvider>
        <profile.ProfileProvider>
          <assistant.AssistantProvider>
            <cart.CartProvider>
              <address.AddressProvider>
                <toast.ToastProvider>
                  <nudge.NudgeProvider>{children}</nudge.NudgeProvider>
                </toast.ToastProvider>
              </address.AddressProvider>
            </cart.CartProvider>
          </assistant.AssistantProvider>
        </profile.ProfileProvider>
      </demo.DemoProvider>
    )
  }
  vi.useFakeTimers()
})

beforeAll(() => {
  Element.prototype.scrollTo = () => {} // jsdom no implementa scroll ni animaciones
  Element.prototype.animate = () => ({ cancel() {} })
})
afterAll(() => {
  delete Element.prototype.scrollTo
  delete Element.prototype.animate
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
})

const renderHome = () =>
  render(
    <Providers>
      <div className="phone">
        <div className="screen-wrap">
          <HomeScreen push={vi.fn()} tab="home" setTab={vi.fn()} />
        </div>
      </div>
    </Providers>,
  )
// De a 100 ms, como en un navegador: entre paso y paso React aplica sus efectos (la máquina de escribir, por ejemplo).
const advance = async (ms) => {
  for (let elapsed = 0; elapsed < ms; elapsed += 100) await act(() => vi.advanceTimersByTimeAsync(100))
}
const blockOrder = (container) =>
  [...container.querySelectorAll('.live-block')].map((block) => block.className.match(/live-block--(\w+)/)[1])

describe('Home con Bigotes vivo', () => {
  test('no tiene ícono de chat: Bigotes vive en la Home de cuerpo entero', () => {
    renderHome()
    expect(screen.queryByRole('button', { name: 'Hablar con Bigotes' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Abrir asistente' })).toBeNull()
    expect(screen.getByText('Tu pasaporte Rappi')).toBeTruthy()
  })

  test('nota el interés, sube su bloque al primer lugar con el fondo oscuro y muestra una vertical nueva', async () => {
    const { container } = renderHome()
    expect(blockOrder(container).indexOf('interest')).toBeGreaterThan(0)
    expect(container.querySelector('.live-block--discovery')).toBeNull()

    await advance(900 + 3400 + 3000) // entra, saluda, pregunta y termina de escribir
    expect(screen.getByText(/^Noté que te encantan/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '¡Sí, tráelos!' }))
    await advance(600 + 1200)

    expect(blockOrder(container).slice(0, 2)).toEqual(['interest', 'discovery'])
    expect(container.querySelector('.home--live').classList.contains('is-dim')).toBe(true)
    expect(container.querySelector('.live-block--essentials').classList.contains('is-dimmed')).toBe(true)
    expect(container.querySelector('.live-block--discovery').classList.contains('is-dimmed')).toBe(false)
    expect(screen.getByText(/^Nuevo para ti:/)).toBeTruthy()

    await advance(7000) // la escena termina sola: se enciende todo y queda «Deshacer»
    expect(container.querySelector('.home--live').classList.contains('is-dim')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(blockOrder(container)).toEqual([
      'essentials',
      'passport',
      'promos',
      'turbo',
      'plan',
      'nearby',
      'interest',
      'lower',
    ])
  })

  test('sin respuesta, lo sube solo; «Ahora no» deja la Home como estaba', async () => {
    const first = renderHome()
    await advance(900 + 3400 + 7000 + 2000)
    expect(blockOrder(first.container)[0]).toBe('interest')

    first.unmount()
    memory.resetLive()
    const { container } = renderHome()
    await advance(900 + 3400 + 3000)
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    await advance(10000)
    expect(blockOrder(container)[0]).toBe('essentials')
  })

  test('elegir un plan arma un kit de varias verticales', async () => {
    renderHome()
    fireEvent.click(screen.getByRole('radio', { name: /Carrete/ }))
    expect(screen.getByText(/^Tu kit en \d+ verticales:/)).toBeTruthy()
  })
})
