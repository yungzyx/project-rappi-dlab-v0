import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { DATA } from '../../../game/data.js'
import { KEY } from '../../../game/storage.js'
import { seed } from '../../../game/testSeed.js'

const events = vi.hoisted(() => ({ track: vi.fn(), flush: async () => {}, clear: () => {}, settled: async () => {} }))
vi.mock('../../../state/EventsContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useEvents: () => events,
}))

// La memoria de la escena vive en el módulo (lo que dura la pestaña): cada test, una pestaña nueva.
let HomeScreen
let Providers
let memory
let useAssistant
beforeEach(async () => {
  vi.resetModules()
  localStorage.setItem('rappi-proto-demo-mode', 'final')
  await import('../../../state/EventsContext')
  const demo = await import('../../../state/DemoContext')
  const profile = await import('../../../state/ProfileContext')
  const assistant = await import('../../../state/AssistantContext')
  const cart = await import('../../../state/CartContext')
  const address = await import('../../../state/AddressContext')
  const toast = await import('../../../components/Toast')
  const nudge = await import('../../../state/NudgeContext')
  const orders = await import('../../../state/OrdersContext')
  const game = await import('../../../state/GameContext')
  memory = await import('../../../state/liveMemory')
  useAssistant = assistant.useAssistant
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
                    <orders.OrdersProvider>
                      <game.GameProvider>{children}</game.GameProvider>
                    </orders.OrdersProvider>
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

const renderHome = ({ strict = false, tab = 'home', push = vi.fn() } = {}) =>
  render(
    <Providers strict={strict}>
      <div className="phone">
        <div className="screen-wrap">
          <HomeScreen push={push} tab={tab} setTab={vi.fn()} />
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

describe('Home del prototipo final', () => {
  test('no tiene ícono de chat: Bigotes vive en la Home de cuerpo entero', () => {
    renderHome()
    expect(screen.queryByRole('button', { name: 'Hablar con Bigotes' })).toBeNull()
    expect(screen.getByText('Tu pasaporte Rappi')).toBeTruthy()
  })

  test('la barra de la Home es el buscador con Bigotes (no el plano) y tocarla lo abre', () => {
    function Probe() {
      return <output data-testid="assistant">{useAssistant().isOpen ? 'abierto' : 'cerrado'}</output>
    }
    const { container } = render(
      <Providers>
        <div className="phone">
          <div className="screen-wrap">
            <HomeScreen push={vi.fn()} tab="home" setTab={vi.fn()} />
          </div>
        </div>
        <Probe />
      </Providers>,
    )
    expect(container.querySelector('.search-bar')).toBeNull()
    expect(screen.getByTestId('assistant').textContent).toBe('cerrado')
    fireEvent.click(screen.getByRole('button', { name: 'Abrir buscador con Bigotes' }))
    expect(screen.getByTestId('assistant').textContent).toBe('abierto')
  })

  test('Bigotes entra y saluda sin sugerir productos ni reordenar ni oscurecer la Home', async () => {
    const { container } = renderHome()
    expect(blockOrder(container)).toEqual(['essentials', 'passport', 'promos', 'turbo', 'plan', 'nearby', 'lower'])

    await advance(900 + 1000) // entra y empieza a saludar
    expect(container.querySelector('.live-bubble p').textContent).toMatch(/^¡Hola! Ahora vivo en tu Home/)

    await advance(12000) // nada sube ni se oscurece después del saludo
    expect(blockOrder(container)).toEqual(['essentials', 'passport', 'promos', 'turbo', 'plan', 'nearby', 'lower'])
    expect(screen.queryByText(/^Tu rincón de/)).toBeNull()
    expect(screen.queryByText(/^Nuevo para ti:/)).toBeNull()
    expect(container.querySelector('.is-dim, .is-dimmed, [inert]')).toBeNull()
    expect(screen.queryByRole('button', { name: '¡Sí, tráelos!' })).toBeNull()
  })

  test('el pasaporte va justo bajo los accesos de siempre', () => {
    const { container } = renderHome()
    const [first, second] = container.querySelectorAll('.live-block')
    expect(first.querySelector('.home-shortcuts')).not.toBeNull()
    expect(second.textContent).toMatch(/^Tu pasaporte Rappi/)
  })

  test('elegir un plan arma un kit de varias verticales', async () => {
    renderHome()
    fireEvent.click(screen.getByRole('radio', { name: /Carrete/ }))
    expect(screen.getByText(/^Tu kit en \d+ verticales:/)).toBeTruthy()
  })

  test('al volver con un sello nuevo lo celebra, también con StrictMode (como en npm run dev)', async () => {
    memory.session.played = true
    memory.session.newStamp = 'liquor' // se abrió Licores desde la Home: sello nuevo
    seed({ visited: ['restaurantes', 'supermercado', 'licores'] })
    const { container } = renderHome({ strict: true })
    await advance(2000)
    expect(container.querySelector('.live-layer [role="status"]').textContent).toMatch(/^¡Sello nuevo de Licores!/)
  })

  test('tocar a Bigotes después del saludo propone una vertical que falta en el pasaporte', async () => {
    const { container } = renderHome()
    await advance(900 + 3400)
    fireEvent.click(screen.getByRole('button', { name: /^Bigotes:/ }))
    await advance(3000) // termina de escribir
    expect(container.querySelector('.live-bubble p').textContent).toMatch(/^¿Y si pruebas/)
  })

  test('«Repetir escena» vuelve a saludar', async () => {
    const { container } = renderHome()
    await advance(900 + 3400 + 6000)
    act(() => memory.resetLive())
    await advance(900 + 1000)
    expect(container.querySelector('.live-bubble p').textContent).toMatch(/^¡Hola! Ahora vivo en tu Home/)
  })

  test('en reposo se asoma desde el borde y, al hacer scroll, se esconde hasta que se para', async () => {
    const { container } = renderHome()
    await advance(900 + 3400 + 6000) // terminó de saludar
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

  test('en la cuenta, «Repetir escena de Bigotes» aparece solo en el prototipo final', () => {
    renderHome({ tab: 'account' })
    expect(screen.getByRole('button', { name: /Repetir escena de Bigotes/ })).toBeTruthy()
    cleanup()
    localStorage.setItem('rappi-proto-demo-mode', 'actual')
    renderHome({ tab: 'account' })
    expect(screen.queryByRole('button', { name: /Repetir escena de Bigotes/ })).toBeNull()
  })

  describe('pasaporte del juego', () => {
    const stampsShown = () => [...document.querySelectorAll('.live-stamps .live-stamp')]
    const passport = () => within(document.querySelector('.live-passport'))

    test('muestra las 8 verticales del juego y arranca con Restaurantes y Súper', () => {
      renderHome()
      expect(stampsShown()).toHaveLength(8)
      expect(screen.getByRole('progressbar', { name: 'Sellos para el envío gratis' }).getAttribute('aria-valuenow')).toBe('2')
      expect(passport().getByRole('button', { name: /^Farmacia/ })).toBeTruthy()
      expect(passport().queryByRole('button', { name: /^Mascotas/ })).toBeNull()
    })

    test('un sello ganado jugando aparece en la Home', () => {
      seed({ visited: ['restaurantes', 'supermercado'], discovered: { licores: ['vino'] } })
      renderHome()
      expect(passport().getByRole('button', { name: /^Licores \(con sello/ })).toBeTruthy()
      expect(screen.getByRole('progressbar', { name: 'Sellos para el envío gratis' }).getAttribute('aria-valuenow')).toBe('3')
    })

    test('«Jugar» y el título abren el juego; un sello abre su hoja', () => {
      const push = vi.fn()
      renderHome({ push })
      fireEvent.click(passport().getByRole('button', { name: 'Jugar' }))
      expect(push).toHaveBeenLastCalledWith('game', { tab: 'jugar' })
      fireEvent.click(passport().getByRole('button', { name: /^Tu pasaporte Rappi/ }))
      expect(push).toHaveBeenLastCalledWith('game', { tab: 'pasaporte' })
      fireEvent.click(passport().getByRole('button', { name: /^Turbo/ }))
      expect(push).toHaveBeenLastCalledWith('game', { vertical: 'turbo' })
    })

    test('Bigotes nunca propone Farmacia, aunque sea la única sin sello', async () => {
      seed({ visited: DATA.order.filter((v) => v !== 'farmacia') })
      const { container } = renderHome()
      await advance(900 + 3400)
      fireEvent.click(screen.getByRole('button', { name: /^Bigotes:/ }))
      await advance(3000)
      expect(container.querySelector('.live-bubble p').textContent).toMatch(/^¡Ya probaste de todo!/)
    })

    test('Bigotes propone jugar la primera vertical sin sello', async () => {
      const push = vi.fn()
      const { container } = renderHome({ push })
      await advance(900 + 3400)
      fireEvent.click(screen.getByRole('button', { name: /^Bigotes:/ }))
      await advance(3000)
      expect(container.querySelector('.live-bubble p').textContent).toMatch(/Express/)
      fireEvent.click(screen.getByRole('button', { name: 'Jugar Express' }))
      expect(push).toHaveBeenLastCalledWith('game', { round: 'conveniencia' })
    })

    test('«Repetir escena» deja el juego y el pasaporte como al empezar', async () => {
      seed({ visited: ['restaurantes', 'supermercado', 'turbo'], xp: 120 })
      renderHome()
      act(() => memory.resetLive())
      await advance(100)
      const saved = JSON.parse(localStorage.getItem(KEY))
      expect(saved?.xp ?? 0).toBe(0)
      expect(screen.getByRole('progressbar', { name: 'Sellos para el envío gratis' }).getAttribute('aria-valuenow')).toBe('2')
    })
  })
})
