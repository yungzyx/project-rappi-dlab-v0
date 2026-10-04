import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { AssistantProvider, useAssistant } from '../../state/AssistantContext'
import { CartProvider } from '../../state/CartContext'
import { DemoProvider } from '../../state/DemoContext'
import { NudgeProvider } from '../../state/NudgeContext'
import { ProfileProvider } from '../../state/ProfileContext'
import AssistantPanel from './AssistantPanel'

const api = vi.hoisted(() => ({
  health: vi.fn(),
  chat: vi.fn(),
  chatVoice: vi.fn(),
  chatPhoto: vi.fn(),
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

/** MediaRecorder de mentira: como el real, avisa el fin de la grabación después de stop(). */
class FakeRecorder {
  static instances = []
  constructor(stream) {
    this.stream = stream
    this.state = 'inactive'
    this.mimeType = 'audio/webm'
    FakeRecorder.instances.push(this)
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    queueMicrotask(() => this.onstop?.())
  }
}

function fakeStream() {
  const track = { stop: vi.fn() }
  return { track, getTracks: () => [track] }
}

function mockMic(getUserMedia) {
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
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

function say(text) {
  const input = screen.getByPlaceholderText('Escríbele a Bigotes…')
  fireEvent.change(input, { target: { value: text } })
  fireEvent.submit(input.closest('form'))
}

function OpenButton() {
  const assistant = useAssistant()
  return (
    <button type="button" onClick={() => assistant.open()}>
      abrir
    </button>
  )
}

async function renderPanel({ push = () => {} } = {}) {
  render(
    <DemoProvider>
      <ProfileProvider>
        <AssistantProvider>
          <CartProvider>
            <NudgeProvider>
              <OpenButton />
              <AssistantPanel push={push} />
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
  delete navigator.mediaDevices
  FakeRecorder.instances = []
  localStorage.clear()
  sessionStorage.clear() // cada test es una pestaña nueva (otra sesión)
})

describe('chat en orden', () => {
  test('las respuestas salen en el orden de las preguntas y la siguiente sabe qué tema ya se sugirió', async () => {
    const first = deferred()
    api.chat.mockReturnValueOnce(first.promise).mockResolvedValueOnce(apiAnswer('Respuesta B'))
    await renderPanel()
    say('pregunta A')
    say('pregunta B')
    await advance(1000)
    expect(api.chat).toHaveBeenCalledTimes(1) // B sale cuando A ya está en pantalla

    first.resolve(apiAnswer('Respuesta A', 'snacks-salados'))
    await runUntilIdle()
    expect(api.chat).toHaveBeenCalledTimes(2)
    expect(api.chat.mock.calls[1][0].shown_topics).toEqual(['snacks-salados'])
    const texts = bubbles()
    expect(texts).toContain('Respuesta A')
    expect(texts.indexOf('Respuesta A')).toBeLessThan(texts.indexOf('Respuesta B'))
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
    expect(push).toHaveBeenCalledWith('vertical', { id: 'liquor' }, expect.anything())
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
    await runUntilIdle()
    expect(push).toHaveBeenCalledWith(
      'store',
      expect.objectContaining({ item: expect.objectContaining({ entityId: '1', vertical: 'licores' }) }),
      expect.anything(),
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
    expect(push).toHaveBeenCalledWith('vertical', { id: 'grocery' }, expect.anything())
  })
})

describe('teclado y lector de pantalla', () => {
  test('al abrir, el foco entra al chat; Escape lo cierra y el foco vuelve a quien lo abrió', async () => {
    await renderPanel()
    expect(document.activeElement).toBe(screen.getByPlaceholderText('Escríbele a Bigotes…'))

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
    say('pisco')
    await runUntilIdle()

    expect(screen.getAllByText('Respuesta local')).toHaveLength(1) // solo la primera; la segunda vino de la API
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

  test('voz y foto saben qué sugirió el chat de texto (no repiten la sugerencia)', async () => {
    mockMic(vi.fn(async () => fakeStream()))
    api.health.mockResolvedValue({ voz: true, fotos: true })
    api.chat.mockResolvedValueOnce(apiAnswer('Cervezas', 'snacks-salados'))
    api.chatPhoto.mockResolvedValueOnce(apiAnswer('Parece cerveza'))
    api.chatVoice.mockResolvedValueOnce(apiAnswer('Más cervezas'))
    URL.createObjectURL = () => 'blob:foto'
    await renderPanel()
    say('cerveza')
    await runUntilIdle()

    const photo = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [photo] } })
    await runUntilIdle()
    fireEvent.click(screen.getByLabelText('Hablar'))
    await advance(10)
    fireEvent.click(screen.getByText('Listo'))
    await runUntilIdle()

    expect(api.chatPhoto.mock.calls[0][1].shown_topics).toEqual(['snacks-salados'])
    expect(api.chatVoice.mock.calls[0][1].shown_topics).toEqual(['snacks-salados'])
    delete URL.createObjectURL
  })
})

describe('voz', () => {
  test('un segundo toque no abre otra grabación, y cerrar antes de dar permiso no graba', async () => {
    const permission = deferred()
    const getUserMedia = vi.fn(() => permission.promise)
    mockMic(getUserMedia)
    await renderPanel()
    fireEvent.click(screen.getByLabelText('Hablar'))
    await advance(10)
    fireEvent.click(screen.getByLabelText('Hablar'))
    await advance(10)
    expect(getUserMedia).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByLabelText('Cerrar'))
    const stream = fakeStream()
    permission.resolve(stream)
    await runUntilIdle()
    expect(FakeRecorder.instances).toHaveLength(0)
    expect(stream.track.stop).toHaveBeenCalled() // el micrófono no queda abierto
    expect(api.chatVoice).not.toHaveBeenCalled()
  })

  test('Cancelar mientras transcribe aborta la subida, descarta el resultado y no pisa una grabación nueva', async () => {
    mockMic(vi.fn(async () => fakeStream()))
    const transcription = deferred()
    api.chatVoice.mockReturnValueOnce(transcription.promise)
    await renderPanel()
    fireEvent.click(screen.getByLabelText('Hablar'))
    await advance(10)
    fireEvent.click(screen.getByText('Listo'))
    await advance(10)
    expect(screen.getByText('Transcribiendo…')).toBeTruthy()

    fireEvent.click(screen.getByText('Cancelar'))
    expect(api.chatVoice.mock.calls[0][2]?.signal?.aborted).toBe(true)

    fireEvent.click(screen.getByLabelText('Hablar')) // grabación nueva
    await advance(10)
    transcription.resolve({ text: 'Respuesta vieja', products: [], transcript: { text: 'lo que dije antes' } })
    await advance(3000)
    expect(screen.queryByText('lo que dije antes')).toBeNull()
    expect(bubbles().some((text) => text.includes('Respuesta vieja'))).toBe(false)
    expect(screen.getByText('Listo')).toBeTruthy() // la grabación nueva sigue en pantalla
  })

  test('la voz simulada responde con el cerebro local: la frase de ejemplo no va a la API', async () => {
    // Sin micrófono (p. ej. el iPhone por http), aunque la API esté arriba.
    await renderPanel()
    fireEvent.click(screen.getByLabelText('Hablar'))
    await runUntilIdle()
    expect(bubbles()).toContain('Arma un carrete para cuatro')
    expect(api.chat).not.toHaveBeenCalled()
  })

  test('si el usuario niega el micrófono no se inventa una frase: se le avisa', async () => {
    mockMic(vi.fn(async () => Promise.reject(new DOMException('Permiso denegado', 'NotAllowedError'))))
    await renderPanel()
    fireEvent.click(screen.getByLabelText('Hablar'))
    await runUntilIdle()
    expect(bubbles().some((text) => /micrófono está bloqueado/.test(text))).toBe(true)
    expect(bubbles()).not.toContain('Arma un carrete para cuatro')
    expect(api.chat).not.toHaveBeenCalled()
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
    expect(document.querySelector('.assistant-messages').textContent).not.toMatch(/Vi que te gusta/)
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
    await advance(100)
    fireEvent.click(screen.getByText('Olvidar'))
    await advance(100)
    say('pregunta mientras se olvida')
    await advance(100)
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

  test('Olvidar espera la foto en camino antes del DELETE (el servidor la registra al responder)', async () => {
    localStorage.setItem('rappi-proto-profile', JSON.stringify({ cerveza: 3 }))
    api.health.mockResolvedValue({ voz: true, fotos: true })
    const pendingPhoto = deferred()
    api.chatPhoto.mockReturnValueOnce(pendingPhoto.promise)
    URL.createObjectURL = () => 'blob:foto'
    await renderPanel()
    const photo = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [photo] } })
    await advance(100)
    expect(api.chatPhoto).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('Olvidar'))
    await advance(100)
    expect(api.forget).not.toHaveBeenCalled()

    pendingPhoto.resolve(apiAnswer('Parece cerveza'))
    await runUntilIdle()
    expect(api.forget).toHaveBeenCalledTimes(1)
    delete URL.createObjectURL
  })

  test('Olvidar con audio ya subido espera al servidor (sin abortar) e ignora su respuesta', async () => {
    localStorage.setItem('rappi-proto-profile', JSON.stringify({ cerveza: 3 }))
    mockMic(vi.fn(async () => fakeStream()))
    const transcription = deferred()
    api.chatVoice.mockReturnValueOnce(transcription.promise)
    await renderPanel()
    fireEvent.click(screen.getByLabelText('Hablar'))
    await advance(10)
    fireEvent.click(screen.getByText('Listo'))
    await advance(10)
    fireEvent.click(screen.getByText('Olvidar'))
    await advance(100)
    expect(api.forget).not.toHaveBeenCalled()
    expect(api.chatVoice.mock.calls[0][2].signal.aborted).toBe(false)

    transcription.resolve({ text: 'Mira estas cervezas', products: [], transcript: { text: 'quiero cerveza' } })
    await runUntilIdle()
    expect(api.forget).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('quiero cerveza')).toBeNull()
    expect(bubbles().some((text) => text.includes('Mira estas cervezas'))).toBe(false)
  })

  test('Olvidar mientras graba descarta la grabación sin subirla', async () => {
    localStorage.setItem('rappi-proto-profile', JSON.stringify({ cerveza: 3 }))
    const stream = fakeStream()
    mockMic(vi.fn(async () => stream))
    await renderPanel()
    fireEvent.click(screen.getByLabelText('Hablar'))
    await advance(10)
    fireEvent.click(screen.getByText('Olvidar'))
    await runUntilIdle()
    expect(stream.track.stop).toHaveBeenCalled()
    expect(api.chatVoice).not.toHaveBeenCalled()
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

describe('mensaje', () => {
  test('el campo corta en 500 caracteres, como la API (más largo, la API responde 422 y el chat caía al cerebro local)', async () => {
    await renderPanel()
    expect(screen.getByPlaceholderText('Escríbele a Bigotes…').maxLength).toBe(500)
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
    expect(push).toHaveBeenCalledWith('travel', undefined, expect.anything())
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
