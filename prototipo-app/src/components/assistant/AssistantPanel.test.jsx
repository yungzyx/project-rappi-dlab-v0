import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { AssistantProvider, useAssistant } from '../../state/AssistantContext'
import { CartProvider } from '../../state/CartContext'
import { DemoProvider } from '../../state/DemoContext'
import { NudgeProvider } from '../../state/NudgeContext'
import { ProductSheetProvider } from '../../state/ProductSheetContext'
import ProductSheet from '../ProductSheet'
import { ProfileProvider } from '../../state/ProfileContext'
import AssistantPanel from './AssistantPanel'

const api = vi.hoisted(() => ({
  health: vi.fn(),
  chat: vi.fn(),
  forget: vi.fn(),
  profile: vi.fn(),
}))
vi.mock('../../api/client', async (importOriginal) => ({ ...(await importOriginal()), ...api }))
const events = vi.hoisted(() => ({ track: vi.fn(), flush: vi.fn(), clear: vi.fn(), settled: vi.fn() }))
vi.mock('../../state/EventsContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useEvents: () => events,
}))

function deferred() {
  let resolve
  const promise = new Promise((res) => (resolve = res))
  return { promise, resolve }
}

const apiAnswer = (text, concept) => ({
  text,
  products: [],
  suggestion: concept
    ? { concept, vertical: 'supermercado', reason: 'Porque sí', question: '¿Algo más?', products: [] }
    : null,
})

const advance = (ms) => act(() => vi.advanceTimersByTimeAsync(ms))
/** Avanza hasta que no quedan temporizadores: "escribiendo…" y el texto letra por letra ya terminaron. */
async function runUntilIdle() {
  await advance(0) // promesas ya resueltas (sin temporizadores pendientes todavía)
  for (let i = 0; i < 100 && vi.getTimerCount() > 0; i++) await advance(250)
}
const bubbles = () => [...document.querySelectorAll('.chat-bubble')].map((el) => el.textContent)

/** Sin chat escrito, a Bigotes se le pregunta abriéndolo con una consulta (como el aviso del carrito o el seguimiento). */
function say(text) {
  const ask = screen.getByText('preguntar')
  ask.dataset.query = text
  fireEvent.click(ask)
}

function OpenButton() {
  const assistant = useAssistant()
  return (
    <>
      <button type="button" onClick={() => assistant.open()}>
        abrir
      </button>
      <button type="button" onClick={(e) => assistant.open({ query: e.currentTarget.dataset.query })}>
        preguntar
      </button>
    </>
  )
}

async function renderPanel({ push = () => {} } = {}) {
  render(
    <DemoProvider>
      <ProfileProvider>
        <AssistantProvider>
          <CartProvider>
            <NudgeProvider>
              <ProductSheetProvider>
                <OpenButton />
                <AssistantPanel push={push} />
                <ProductSheet />
              </ProductSheetProvider>
            </NudgeProvider>
          </CartProvider>
        </AssistantProvider>
      </ProfileProvider>
    </DemoProvider>,
  )
  screen.getByText('abrir').focus() // como al tocarlo: el foco queda en quien abrió el asistente
  fireEvent.click(screen.getByText('abrir'))
  await runUntilIdle()
}

beforeAll(() => {
  Element.prototype.scrollTo = () => {} // jsdom no lo implementa
})
afterAll(() => {
  delete Element.prototype.scrollTo
})
beforeEach(() => {
  vi.useFakeTimers()
  window.history.replaceState(null, '', '/') // cada test parte sin una entrada del asistente debajo
  api.health.mockResolvedValue({ voz: true, fotos: false })
  api.profile.mockResolvedValue({ interests: [] })
  api.forget.mockResolvedValue({})
  events.settled.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  Object.values(api).forEach((mock) => mock.mockReset())
  localStorage.clear()
  sessionStorage.clear() // cada test es una pestaña nueva (otra sesión)
})

describe('chat en orden', () => {
  test('las respuestas salen en el orden de las preguntas y la siguiente sabe qué tema ya se sugirió', async () => {
    const first = deferred()
    api.chat.mockReturnValueOnce(first.promise).mockResolvedValueOnce(apiAnswer('Respuesta B'))
    await renderPanel()
    say('pregunta A')
    await advance(10) // cada apertura lleva su hora: con el reloj simulado, dos en el mismo instante serían una
    say('pregunta B')
    await advance(1000)
    expect(api.chat).toHaveBeenCalledTimes(1) // B sale cuando A ya está en pantalla

    first.resolve(apiAnswer('Respuesta A', 'snacks-salados'))
    await runUntilIdle()
    expect(api.chat).toHaveBeenCalledTimes(2)
    expect(api.chat.mock.calls[0][0].message).toBe('pregunta A')
    expect(api.chat.mock.calls[1][0].shown_topics).toEqual(['snacks-salados'])
    // Bigotes muestra su última respuesta (no un historial de chat)
    expect(bubbles()).toContain('Respuesta B')
    expect(bubbles()).not.toContain('Respuesta A')
  })
})

describe('sugerencia cruzada', () => {
  test('dice de qué vertical viene y su botón abre esa vertical', async () => {
    const push = vi.fn()
    api.chat.mockResolvedValueOnce({
      text: 'Mira estas hamburguesas',
      products: [],
      suggestion: {
        concept: 'gaseosas',
        vertical: 'licores',
        prototype_vertical: 'liquor',
        reason: 'Porque llevas 🍔 hamburguesa',
        question: '¿Te tinca sumar gaseosas?',
        products: [
          {
            id: 'cat-1',
            entity_type: 'catalog_item',
            entity_id: '1',
            name: 'Bebida Pepsi 1,5 L',
            price: '$1.990',
            store: 'Botillería',
            vertical: 'licores',
            concept: 'gaseosas',
          },
        ],
      },
    })
    await renderPanel({ push })
    say('una hamburguesa')
    await runUntilIdle()

    expect(screen.getByText('De Licores')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Ver más en Licores/ }))
    await runUntilIdle()
    expect(push).toHaveBeenCalledWith('vertical', { id: 'liquor' })
  })

  test('tocar un producto abre su tienda con ese producto: la página registra que lo vio', async () => {
    const push = vi.fn()
    api.chat.mockResolvedValueOnce({
      ...apiAnswer('Mira estas hamburguesas', 'gaseosas'),
      suggestion: {
        ...apiAnswer('', 'gaseosas').suggestion,
        products: [
          {
            id: 'cat-1',
            entity_type: 'catalog_item',
            entity_id: '1',
            name: 'Bebida Pepsi 1,5 L',
            store: 'Botillería',
            vertical: 'licores',
          },
        ],
      },
    })
    await renderPanel({ push })
    say('una hamburguesa')
    await runUntilIdle()

    fireEvent.click(screen.getByText('Bebida Pepsi 1,5 L'))
    fireEvent.click(screen.getByRole('button', { name: /Ver tienda/ })) // la tarjeta abre la hoja del producto
    await runUntilIdle()
    expect(push).toHaveBeenCalledWith(
      'store',
      expect.objectContaining({ item: expect.objectContaining({ entityId: '1', vertical: 'licores' }) }),
    )
  })
})

describe('también en otras verticales', () => {
  test('muestra las verticales con sus tiendas (logo o inicial) y cada una abre su vertical', async () => {
    const push = vi.fn()
    api.chat.mockResolvedValueOnce({
      text: 'Mira estas cervezas',
      products: [],
      also_in: {
        concept: 'cerveza',
        label: '🍺 Cerveza',
        verticals: [
          {
            vertical: 'supermercado',
            prototype_vertical: 'grocery',
            items: 262,
            stores: [
              { name: 'Unimarc', logo: 'https://x/u.png' },
              { name: 'Lider', logo: null },
            ],
          },
        ],
      },
    })
    await renderPanel({ push })
    say('cerveza')
    await runUntilIdle()

    expect(screen.getByText('También en')).toBeTruthy()
    const button = screen.getByRole('button', { name: /Súper.*Unimarc · Lider.*262 productos/ })
    expect(button.querySelector('img').getAttribute('src')).toBe('https://x/u.png')
    expect(button.textContent).toContain('L') // Lider sin logo: su inicial
    fireEvent.click(button)
    await runUntilIdle()
    expect(push).toHaveBeenCalledWith('vertical', { id: 'grocery' })
  })
})

describe('teclado y lector de pantalla', () => {
  test('al abrir, el foco entra al buscador (sin abrir el teclado); Escape lo cierra y el foco vuelve a quien lo abrió', async () => {
    await renderPanel()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Volver' }))

    fireEvent.keyDown(document.activeElement, { key: 'Escape' })
    await runUntilIdle()

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByText('abrir'))
  })

  test('Tab no se sale del asistente', async () => {
    await renderPanel()
    const dialog = screen.getByRole('dialog')
    const focusable = dialog.querySelectorAll('button:not([disabled]), input:not([disabled]):not([hidden])')
    focusable[focusable.length - 1].focus()

    fireEvent.keyDown(document.activeElement, { key: 'Tab' })

    expect(document.activeElement).toBe(focusable[0])
  })

  test('cada respuesta completa se anuncia una vez al lector de pantalla', async () => {
    api.health.mockResolvedValue(null)
    await renderPanel()
    say('cerveza')
    await runUntilIdle()

    expect(screen.getByTestId('assistant-announcer').textContent).toMatch(/cerveza/i)
  })
})

describe('qué Bigotes contestó', () => {
  test('si la API falla, la respuesta del cerebro local se marca en pantalla', async () => {
    api.chat.mockRejectedValueOnce(new Error('API 500')).mockResolvedValueOnce(apiAnswer('Desde la API'))
    await renderPanel()
    say('cerveza')
    await runUntilIdle()
    expect(screen.getByText('Respuesta local')).toBeTruthy()
    say('pisco')
    await runUntilIdle()
    expect(screen.queryByText('Respuesta local')).toBeNull() // la segunda vino de la API
  })
})

describe('temas ya sugeridos', () => {
  test('recargar la página no olvida lo ya sugerido en la sesión', async () => {
    api.chat.mockResolvedValueOnce(apiAnswer('Mira estos jugos', 'jugos')).mockResolvedValueOnce(apiAnswer('Ok'))
    await renderPanel()
    say('algo para el desayuno')
    await runUntilIdle()
    cleanup() // recarga: el panel se monta de nuevo y la sesión sigue en sessionStorage
    await renderPanel()
    say('y algo más')
    await runUntilIdle()

    expect(api.chat.mock.calls[1][0].shown_topics).toEqual(['jugos'])
  })
})

describe('lo aprendido y Olvidar', () => {
  test('si la API aún no aprendió nada, se ve lo aprendido localmente, con su Olvidar', async () => {
    localStorage.setItem('rappi-proto-profile', JSON.stringify({ cerveza: 3 }))
    await renderPanel()
    expect(screen.getByText('🍺 Cerveza')).toBeTruthy()
    expect(screen.getByText('Olvidar')).toBeTruthy()
  })

  test('tras Olvidar, el saludo personalizado se va y queda la confirmación', async () => {
    localStorage.setItem('rappi-proto-profile', JSON.stringify({ cerveza: 3 }))
    await renderPanel()
    expect(screen.getAllByText(/Vi que te gusta/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByText('Olvidar'))
    await runUntilIdle()
    expect(document.querySelector('.bigotes-card').textContent).not.toMatch(/Vi que te gusta/)
    expect(screen.getAllByText(/olvidé lo que aprendí de ti/).length).toBeGreaterThan(0)
  })

  test('Olvidar espera la pregunta en curso y el lote de eventos antes del DELETE, y mientras no se envía nada', async () => {
    localStorage.setItem('rappi-proto-profile', JSON.stringify({ cerveza: 3 }))
    const pendingChat = deferred()
    const pendingFlush = deferred()
    api.chat.mockReturnValueOnce(pendingChat.promise)
    events.settled.mockReturnValueOnce(pendingFlush.promise)
    await renderPanel()
    say('pregunta A')
    await advance(500) // sale al terminar de abrir
    fireEvent.click(screen.getByText('Olvidar'))
    await advance(100)
    say('pregunta mientras se olvida')
    await advance(500)
    expect(api.chat).toHaveBeenCalledTimes(1)
    expect(api.forget).not.toHaveBeenCalled()

    pendingChat.resolve(apiAnswer('Respuesta A'))
    await runUntilIdle()
    expect(events.clear).toHaveBeenCalled() // lo que dejó en cola la respuesta no se envía
    expect(api.forget).not.toHaveBeenCalled() // falta que termine el lote en camino

    pendingFlush.resolve()
    await advance(0)
    expect(api.forget).toHaveBeenCalledTimes(1)
  })

  test('un perfil remoto que llega después de Olvidar no revive lo olvidado', async () => {
    localStorage.setItem('rappi-proto-profile', JSON.stringify({ cerveza: 3 }))
    const remote = deferred()
    api.profile.mockReturnValueOnce(remote.promise)
    await renderPanel()
    fireEvent.click(screen.getByText('Olvidar'))
    remote.resolve({ interests: [{ concept: 'vino', label: '🍷 Vino' }] })
    await runUntilIdle()
    expect(screen.queryByText('🍷 Vino')).toBeNull()
    expect(screen.queryByText('Aprendiendo de ti:')).toBeNull()
  })
})

describe('sin chat escrito', () => {
  test('no hay dónde escribirle a Bigotes: se le pide con un toque y se ve lo elegido', async () => {
    api.chat.mockResolvedValueOnce(apiAnswer('Para el carrete'))
    await renderPanel()
    expect(screen.queryByPlaceholderText(/Escríbele/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '🍻 Arma un carrete' }))
    await runUntilIdle()
    expect(api.chat.mock.calls[0][0].message).toBe('Arma un carrete')
    expect(screen.getByText('Elegiste «Arma un carrete»')).toBeTruthy()
    expect(bubbles()).toContain('Para el carrete')
  })

  test('lo escrito en el buscador busca en el catálogo (como en «Rappi hoy»), no le pregunta a Bigotes', async () => {
    await renderPanel()
    const field = screen.getByLabelText('Buscar en Rappi')
    expect(field.maxLength).toBe(500)
    fireEvent.change(field, { target: { value: 'cerveza' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await runUntilIdle()

    expect(api.chat).not.toHaveBeenCalled()
    expect(screen.getByText('Products')).toBeTruthy()
    expect(screen.queryByText('Descubre con Bigotes')).toBeNull()
    expect(events.track).toHaveBeenCalledWith('search', expect.objectContaining({ query: 'cerveza', modality: 'texto' }))
  })
})

describe('Descubre con Bigotes', () => {
  test('muestra lo explorado y cada tarjeta abre una vertical que aún no abre', async () => {
    const push = vi.fn()
    sessionStorage.setItem('rappi-explored', JSON.stringify(['liquor']))
    await renderPanel({ push })

    expect(screen.getByRole('progressbar', { name: 'Verticales exploradas' }).getAttribute('aria-valuenow')).toBe('1')
    expect(screen.getByRole('button', { name: 'Licores, ya la exploraste' })).toBeTruthy()

    const [card] = document.querySelectorAll('.discover-card')
    fireEvent.click(card)
    await runUntilIdle()
    const [[name, params]] = push.mock.calls
    expect(name === 'vertical' ? params.id : name).not.toBe('liquor')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('servicios sin catálogo', () => {
  test('RappiTravel queda registrado como ofrecido y abierto, y su gancho con su origen', async () => {
    const push = vi.fn()
    api.chat.mockResolvedValueOnce({
      text: 'Para eso está ✈️ RappiTravel',
      products: [],
      service: 'rappitravel',
      actions: [{ label: 'Abrir RappiTravel', route: ['travel'], service: 'rappitravel' }],
      suggestion: {
        concept: 'dermocosmetica',
        vertical: 'farmacia',
        reason: 'Para tu viaje ✈️',
        question: '¿Llevas protector solar?',
        products: [],
      },
    })
    await renderPanel({ push })
    say('me voy de vacaciones')
    await runUntilIdle()

    const tracked = (type) => events.track.mock.calls.filter(([name]) => name === type).map(([, fields]) => fields)
    expect(tracked('service_shown')).toEqual([{ payload: { servicio: 'rappitravel' } }])
    expect(tracked('suggestion_shown')).toContainEqual({
      concept_id: 'dermocosmetica',
      vertical: 'farmacia',
      payload: { origen: 'rappitravel' },
    })

    fireEvent.click(screen.getByText('Abrir RappiTravel →'))
    await runUntilIdle()
    expect(tracked('service_opened')).toEqual([{ payload: { servicio: 'rappitravel' } }])
    expect(push).toHaveBeenCalledWith('travel', undefined)
  })
})

describe('sugerencias mostradas', () => {
  test('la misma sugerencia mostrada dos veces en la pestaña cuenta una sola vez para el panel', async () => {
    api.chat.mockResolvedValue(apiAnswer('Aquí tienes cervezas', 'helados'))
    await renderPanel()
    say('cerveza')
    await runUntilIdle()
    say('otra cerveza')
    await runUntilIdle()
    const shown = events.track.mock.calls.filter(([name, f]) => name === 'suggestion_shown' && f.concept_id === 'helados')
    expect(shown).toHaveLength(1)
  })
})

describe('conversación', () => {
  test('el mensaje siguiente lleva el pedido anterior: «más barata» se lee sobre «cerveza»', async () => {
    api.chat.mockResolvedValueOnce({
      text: 'Mira estas cervezas',
      vertical: 'licores',
      intent: { query: 'cerveza', concepts: ['cerveza'] },
      products: [{ id: 'cat-1', entity_type: 'catalog_item', entity_id: '1', name: 'Escudo', price: '$1.290' }],
    })
    api.chat.mockResolvedValueOnce({ text: 'Las más baratas', products: [] })
    await renderPanel()
    say('cerveza')
    await runUntilIdle()
    say('más barata')
    await runUntilIdle()

    expect(api.chat.mock.calls[0][0].previous).toBeUndefined()
    expect(api.chat.mock.calls[1][0].previous).toEqual({
      query: 'cerveza',
      concepts: ['cerveza'],
      vertical: 'licores',
      product_ids: ['1'],
    })
  })
})

describe('volver a Bigotes desde una tienda', () => {
  test('abrir una tienda apila la pantalla y, al volver, el panel se reabre con la búsqueda que tenía', async () => {
    const push = vi.fn()
    await renderPanel({ push })
    const assistantEntry = window.history.state
    expect(assistantEntry.assistant).toBe(true)

    const input = screen.getByLabelText('Buscar en Rappi')
    fireEvent.change(input, { target: { value: 'unimarc' } })
    fireEvent.click(document.querySelector('.search-store'))
    expect(push).toHaveBeenCalledWith('store', expect.objectContaining({ store: expect.anything() }))
    // La entrada del asistente sigue en el historial, con su búsqueda; la tienda se apila encima (sin replace).
    expect(window.history.state).toMatchObject({ assistant: true, assistantSearch: 'unimarc' })
    await runUntilIdle()
    expect(screen.queryByRole('dialog')).toBeNull()

    // Gesto volver desde la tienda: el navegador vuelve a la entrada del asistente.
    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state })))
    await runUntilIdle()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByLabelText('Buscar en Rappi').value).toBe('unimarc')
  })
})

describe('barra del carrito dentro del panel', () => {
  test('con productos en el carro el panel deja espacio abajo para la barra', async () => {
    await renderPanel()
    expect(document.querySelector('.assistant.has-cart')).toBeNull()
    fireEvent.change(screen.getByLabelText('Buscar en Rappi'), { target: { value: 'palta' } })
    fireEvent.click(screen.getAllByLabelText(/^Agregar /)[0])
    expect(document.querySelector('.assistant.has-cart')).toBeTruthy()
  })
})
