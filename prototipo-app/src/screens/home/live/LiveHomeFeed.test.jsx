import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { fixture, stubApi } from '../../../api/testing'
import { DATA } from '../../../game/data.js'
import { KEY } from '../../../game/storage.js'
import { seed } from '../../../game/testSeed.js'
import { today } from '../../../game/progress.js'

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
  localStorage.setItem('rappi-proto-guia-vista', '1') // como quien ya vio la guía (sus tests la quitan)
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
  stubApi({}) // la Home pide su catálogo a la API: sin respuestas, esas secciones no se ven
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
  vi.unstubAllGlobals()
  localStorage.clear()
})

const homeTree = ({ strict = false, tab = 'home', push = vi.fn(), active = true } = {}) => (
  <Providers strict={strict}>
    <div className="phone">
      <div className="screen-wrap">
        <HomeScreen push={push} tab={tab} setTab={vi.fn()} active={active} />
      </div>
    </div>
  </Providers>
)
const renderHome = (options) => render(homeTree(options))
// De a 100 ms, como en un navegador: entre paso y paso React aplica sus efectos (la máquina de escribir, por ejemplo).
const advance = async (ms) => {
  for (let elapsed = 0; elapsed < ms; elapsed += 100) await act(() => vi.advanceTimersByTimeAsync(100))
}
const blockOrder = (container) =>
  [...container.querySelectorAll('.live-block')].map((block) => block.className.match(/live-block--(\w+)/)[1])

describe('Home del prototipo final', () => {
  test('no tiene ícono de chat: Mochi vive en la Home de cuerpo entero', () => {
    renderHome()
    expect(screen.queryByRole('button', { name: 'Hablar con Mochi' })).toBeNull()
    expect(screen.getByText('Tu pasaporte Rappi')).toBeTruthy()
  })

  test('la barra de la Home es el buscador con Mochi (no el plano) y tocarla lo abre', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Abrir buscador con Mochi' }))
    expect(screen.getByTestId('assistant').textContent).toBe('abierto')
  })

  test('Mochi entra y saluda sin sugerir productos ni reordenar ni oscurecer la Home', async () => {
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

  test('las listas de la API van en los bloques de siempre; si fallan, la Home sigue igual', async () => {
    stubApi({
      '/catalog/home': fixture('catalog-home'),
      '/catalog/restaurants': fixture('catalog-restaurants').slice(0, 6),
    })
    const { container } = renderHome()
    await advance(300)
    const block = (id) => container.querySelector(`.live-block--${id}`)
    expect(within(block('turbo')).getByText('Restaurantes rápidos')).toBeTruthy()
    expect(within(block('nearby')).getByText('Cerca de ti')).toBeTruthy()
    expect(within(block('nearby')).getByText('Supermercado de prueba Centro')).toBeTruthy()
    expect(within(block('lower')).getByText('Mejor evaluados')).toBeTruthy()
    expect(blockOrder(container)).toEqual(['essentials', 'passport', 'promos', 'turbo', 'plan', 'nearby', 'lower'])

    cleanup()
    stubApi({ '/catalog/home': 'offline', '/catalog/restaurants': 'offline' })
    const failed = renderHome()
    await advance(300)
    expect(failed.container.querySelector('.live-block--nearby').textContent).toBe('')
    expect(failed.container.querySelector('.live-block--lower').textContent).toBe('')
    expect(blockOrder(failed.container)).toEqual(['essentials', 'passport', 'promos', 'turbo', 'plan', 'nearby', 'lower'])
    expect(screen.queryByText('Sin conexión')).toBeNull()
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

  test('la Home queda montada bajo la vertical abierta: al volver a estar arriba, celebra el sello nuevo', async () => {
    seed({ visited: ['restaurantes', 'supermercado', 'licores'] })
    const { container, rerender } = renderHome()
    await advance(900 + 3400 + 6000) // saluda y se calla
    rerender(homeTree({ active: false })) // se abrió Licores encima de la Home
    memory.session.newStamp = 'liquor'
    rerender(homeTree({ active: true })) // volvió
    await advance(2000)
    expect(container.querySelector('.live-layer [role="status"]').textContent).toMatch(/^¡Sello nuevo de Licores!/)
  })

  test('al tocar a Mochi salta (aunque empiece a hablar) y después vuelve a su pose', async () => {
    const { container } = renderHome()
    await advance(900 + 3400)
    const body = screen.getByRole('button', { name: /^Mochi:/ })
    fireEvent.pointerDown(body)
    fireEvent.click(body)
    await advance(300)
    expect(container.querySelector('.live-bigotes .mochi').classList).toContain('mascot--jump')
    await advance(1000)
    expect(container.querySelector('.live-bigotes .mochi').classList).not.toContain('mascot--jump')
  })

  test('al celebrar un sello nuevo, Mochi salta', async () => {
    memory.session.played = true
    memory.session.newStamp = 'liquor'
    seed({ visited: ['restaurantes', 'supermercado', 'licores'] })
    const { container } = renderHome()
    await advance(4000) // termina de escribir la celebración
    expect(container.querySelector('.live-bigotes .mochi').classList).toContain('mascot--jump')
  })

  describe('silenciado por hoy (desde Mochi flotante)', () => {
    const quietToday = () => localStorage.setItem('rappi-proto-mochi-silencio', today())
    const status = (container) => container.querySelector('.live-layer [role="status"]').textContent

    test('al volver no comenta lo agregado', async () => {
      quietToday()
      memory.session.played = true
      memory.session.lastAdded = { id: 'x', name: 'Cerveza Escudo Lata 470 cc', vertical: 'liquor', store: 'Botillería' }
      const { container } = renderHome()
      await advance(3000)
      expect(status(container)).toBe('')
    })

    test('al volver no celebra el sello con un globo', async () => {
      quietToday()
      memory.session.played = true
      memory.session.newStamp = 'liquor'
      seed({ visited: ['restaurantes', 'supermercado', 'licores'] })
      const { container } = renderHome()
      await advance(3000)
      expect(status(container)).toBe('')
    })

    test('entra sin saludar, pero si lo tocan responde', async () => {
      quietToday()
      const { container } = renderHome()
      await advance(900 + 3400)
      expect(status(container)).toBe('')
      fireEvent.click(screen.getByRole('button', { name: /^Mochi:/ }))
      await advance(3000)
      expect(status(container)).toMatch(/^¿Y si pruebas/)
    })
  })

  test('«Después» cuenta como ignorarlo: a la segunda, Mochi se calla', async () => {
    const quiet = await import('../../../state/mochiQuiet')
    renderHome()
    await advance(900 + 3400 + 6000)
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByRole('button', { name: /^Mochi:/ }))
      await advance(3000)
      fireEvent.click(screen.getByRole('button', { name: 'Después' }))
      await advance(500)
    }
    expect(quiet.isHushed()).toBe(true)
  })

  describe('guía de la primera vez', () => {
    beforeEach(() => localStorage.removeItem('rappi-proto-guia-vista'))
    const status = (container) => container.querySelector('.live-layer [role="status"]').textContent
    const at = (container) => container.querySelector('.live-bigotes').dataset.at
    const AFTER_GREETING = 900 + 6000 + 3000 // entra, saluda y termina de escribir el primer paso
    const next = async (name) => {
      fireEvent.click(screen.getByRole('button', { name }))
      await advance(3000)
    }

    test('la primera vez, después del saludo, Mochi muestra el buscador, el pasaporte y «Jugar»', async () => {
      const { container } = renderHome()
      await advance(AFTER_GREETING)
      expect(status(container)).toMatch(/^Arriba está mi buscador/)
      await next('Siguiente')
      expect(status(container)).toMatch(/pasaporte/)
      expect(at(container)).toBe('passport')
      await next('Siguiente')
      expect(status(container)).toMatch(/«Jugar»/)
      expect(at(container)).toBe('passport')
      await next('Listo')
      expect(status(container)).toBe('')
      expect(localStorage.getItem(memory.TOUR_KEY)).toBeTruthy()
    })

    test('«Saltar» la termina y no vuelve', async () => {
      const { container } = renderHome()
      await advance(AFTER_GREETING)
      await next('Saltar')
      expect(status(container)).toBe('')
      cleanup()
      memory.session.played = false
      const again = renderHome()
      await advance(AFTER_GREETING + 6000)
      expect(status(again.container)).not.toMatch(/buscador|pasaporte|Jugar/)
    })

    test('la segunda visita no la muestra', async () => {
      localStorage.setItem(memory.TOUR_KEY, '1')
      const { container } = renderHome()
      await advance(AFTER_GREETING)
      expect(status(container)).not.toMatch(/^Arriba está mi buscador/)
    })

    test('«Repetir escena» la vuelve a mostrar', async () => {
      localStorage.setItem(memory.TOUR_KEY, '1')
      const { container } = renderHome()
      await advance(AFTER_GREETING)
      act(() => memory.resetLive())
      await advance(AFTER_GREETING)
      expect(status(container)).toMatch(/^Arriba está mi buscador/)
    })

    test('si tocan a Mochi en medio, la guía termina (vista) y Mochi sigue celebrando al volver', async () => {
      seed({ visited: ['restaurantes', 'supermercado', 'licores'] })
      const { container, rerender } = renderHome()
      await advance(AFTER_GREETING)
      fireEvent.click(screen.getByRole('button', { name: /^Mochi:/ }))
      await advance(3000)
      expect(status(container)).toMatch(/^¿Y si pruebas/)
      expect(localStorage.getItem(memory.TOUR_KEY)).toBeTruthy()
      rerender(homeTree({ active: false }))
      memory.session.newStamp = 'liquor'
      rerender(homeTree({ active: true }))
      await advance(2000)
      expect(status(container)).toMatch(/^¡Sello nuevo de Licores!/)
    })

    test('no pisa lo que la persona pidió tocando a Mochi justo antes', async () => {
      const { container } = renderHome()
      await advance(900 + 3400 + 700)
      fireEvent.click(screen.getByRole('button', { name: /^Mochi:/ }))
      await advance(5000)
      expect(status(container)).toMatch(/^¿Y si pruebas/)
    })

    test('el plan del día no interrumpe la guía', async () => {
      let seePlan
      globalThis.IntersectionObserver = class {
        constructor(callback) {
          seePlan = callback
        }
        observe() {}
        disconnect() {}
      }
      try {
        const { container } = renderHome()
        await advance(AFTER_GREETING)
        act(() => seePlan([{ isIntersecting: true }]))
        await advance(1000)
        expect(status(container)).toMatch(/^Arriba está mi buscador/)
      } finally {
        delete globalThis.IntersectionObserver
      }
    })

    test('al terminar la guía, Mochi muestra lo pendiente de «al volver»', async () => {
      seed({ visited: ['restaurantes', 'supermercado', 'licores'] })
      const { container, rerender } = renderHome()
      await advance(AFTER_GREETING)
      rerender(homeTree({ active: false })) // se abrió algo encima en medio de la guía
      memory.session.newStamp = 'liquor'
      rerender(homeTree({ active: true }))
      await advance(2000)
      expect(status(container)).toMatch(/^Arriba está mi buscador/) // la guía sigue
      await next('Siguiente')
      await next('Siguiente')
      await next('Listo')
      expect(status(container)).toMatch(/^¡Sello nuevo de Licores!/)
    })

    test('con «reducir movimiento» también funciona', async () => {
      const original = window.matchMedia
      window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
      try {
        const { container } = renderHome()
        await advance(6000 + 3000)
        expect(status(container)).toMatch(/^Arriba está mi buscador/)
      } finally {
        window.matchMedia = original
      }
    })
  })

  test('el pasaporte de la Home tiene 9 sellos y el último es Viajes', () => {
    const { container } = renderHome()
    const stamps = container.querySelectorAll('.live-stamp')
    expect(stamps).toHaveLength(9)
    expect(stamps[8].getAttribute('aria-label')).toMatch(/^Viajes/)
  })

  test('tocar a Mochi después del saludo propone una vertical que falta en el pasaporte', async () => {
    const { container } = renderHome()
    await advance(900 + 3400)
    fireEvent.click(screen.getByRole('button', { name: /^Mochi:/ }))
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

  test('en la cuenta, «Repetir escena de Mochi» aparece solo en el prototipo final', () => {
    renderHome({ tab: 'account' })
    expect(screen.getByRole('button', { name: /Repetir escena de Mochi/ })).toBeTruthy()
    cleanup()
    localStorage.setItem('rappi-proto-demo-mode', 'actual')
    renderHome({ tab: 'account' })
    expect(screen.queryByRole('button', { name: /Repetir escena de Mochi/ })).toBeNull()
  })

  describe('pasaporte del juego', () => {
    const stampsShown = () => [...document.querySelectorAll('.live-stamps .live-stamp')]
    const passport = () => within(document.querySelector('.live-passport'))

    test('muestra las 9 verticales del pasaporte y arranca con Restaurantes y Súper', () => {
      renderHome()
      expect(stampsShown()).toHaveLength(9)
      expect(screen.getByRole('progressbar', { name: 'Sellos para el envío gratis' }).getAttribute('aria-valuenow')).toBe('2')
      expect(passport().getByRole('button', { name: /^Farmacia/ })).toBeTruthy()
      expect(passport().queryByRole('button', { name: /^Mascotas/ })).toBeNull()
    })

    test('un sello ganado jugando aparece en la Home', () => {
      seed({ visited: ['restaurantes', 'supermercado'], discovered: { licores: ['licores-01'] } })
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

    test('Mochi nunca propone Farmacia, aunque sea la única sin sello', async () => {
      seed({ visited: [...DATA.order, 'viajes'].filter((v) => v !== 'farmacia') })
      const { container } = renderHome()
      await advance(900 + 3400)
      fireEvent.click(screen.getByRole('button', { name: /^Mochi:/ }))
      await advance(3000)
      expect(container.querySelector('.live-bubble p').textContent).toMatch(/^¡Ya probaste de todo!/)
    })

    test('Mochi propone jugar la primera vertical sin sello', async () => {
      const push = vi.fn()
      const { container } = renderHome({ push })
      await advance(900 + 3400)
      fireEvent.click(screen.getByRole('button', { name: /^Mochi:/ }))
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
