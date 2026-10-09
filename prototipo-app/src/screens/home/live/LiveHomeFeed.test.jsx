import { StrictMode } from 'react'
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
  const orders = await import('../../../state/OrdersContext')
  memory = await import('../../../state/liveMemory')
  HomeScreen = (await import('../HomeScreen')).default
  Providers = function Providers({ children, strict }) {
    const tree = (
      <demo.DemoProvider>
        <profile.ProfileProvider>
          <assistant.AssistantProvider>
            <cart.CartProvider>
              <address.AddressProvider>
                <toast.ToastProvider>
                  <nudge.NudgeProvider>
                    <orders.OrdersProvider>{children}</orders.OrdersProvider>
                  </nudge.NudgeProvider>
                </toast.ToastProvider>
              </address.AddressProvider>
            </cart.CartProvider>
          </assistant.AssistantProvider>
        </profile.ProfileProvider>
      </demo.DemoProvider>
    )
    return strict ? <StrictMode>{tree}</StrictMode> : tree
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

const renderHome = ({ strict = false, tab = 'home' } = {}) =>
  render(
    <Providers strict={strict}>
      <div className="phone">
        <div className="screen-wrap">
          <HomeScreen push={vi.fn()} tab={tab} setTab={vi.fn()} />
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
    expect(container.querySelector('.live-bubble p').textContent).toMatch(/^Noté que te encantan los chocolates/)
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

  test('al volver con un sello nuevo lo celebra, también con StrictMode (como en npm run dev)', async () => {
    memory.session.played = true
    memory.stamp('liquor')
    const { container } = renderHome({ strict: true })
    await advance(2000)
    expect(container.querySelector('.live-layer [role="status"]').textContent).toMatch(/^¡Sello nuevo de Licores!/)
  })

  test('tocar a Bigotes mientras pregunta no le quita a la persona el «Ahora no»', async () => {
    const { container } = renderHome()
    await advance(900 + 3400 + 3000)
    fireEvent.click(screen.getByRole('button', { name: /^Bigotes:/ }))
    expect(screen.getByRole('button', { name: 'Ahora no' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    await advance(10000)
    expect(blockOrder(container)[0]).toBe('essentials')
  })

  test('«Repetir escena» a mitad del movimiento no deja la escena vieja corriendo', async () => {
    const { container } = renderHome()
    await advance(900 + 3400 + 3000)
    fireEvent.click(screen.getByRole('button', { name: '¡Sí, tráelos!' }))
    await advance(300) // aún subiendo
    act(() => memory.resetLive())
    await advance(3000) // antes de que vuelva a preguntar
    expect(blockOrder(container)[0]).toBe('essentials')
    expect(container.querySelector('.home--live').classList.contains('is-dim')).toBe(false)
  })

  test('en reposo se asoma desde el borde y, al hacer scroll, se esconde hasta que se para', async () => {
    const { container } = renderHome()
    await advance(900 + 3400 + 3000)
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    const bigotes = container.querySelector('.live-bigotes')
    expect(bigotes.classList.contains('is-resting')).toBe(true)
    fireEvent.scroll(container.querySelector('.home--live'))
    expect(bigotes.classList.contains('is-tucked')).toBe(true)
    await advance(800)
    expect(bigotes.classList.contains('is-tucked')).toBe(false)
  })

  test('el kit agregado cambia el botón a «En tu carro» y el pasaporte muestra su avance', async () => {
    renderHome()
    expect(screen.getByRole('progressbar', { name: 'Sellos para el envío gratis' }).getAttribute('aria-valuenow')).toBe(
      '2',
    )
    fireEvent.click(screen.getByRole('radio', { name: /Carrete/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Agregar el kit/ }))
    expect(screen.getByRole('button', { name: /En tu carro · Ir a pagar/ })).toBeTruthy()
  })

  test('en la cuenta, «Repetir escena de Bigotes» aparece solo en este modo', () => {
    renderHome({ tab: 'account' })
    expect(screen.getByRole('button', { name: /Repetir escena de Bigotes/ })).toBeTruthy()
    cleanup()
    localStorage.setItem('rappi-proto-demo-mode', 'propuesta')
    renderHome({ tab: 'account' })
    expect(screen.queryByRole('button', { name: /Repetir escena de Bigotes/ })).toBeNull()
  })
})
