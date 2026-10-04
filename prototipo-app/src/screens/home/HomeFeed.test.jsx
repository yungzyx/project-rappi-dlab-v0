import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ health: vi.fn(), recommendations: vi.fn() }))
vi.mock('../../api/client', async (importOriginal) => ({ ...(await importOriginal()), ...api }))
const events = vi.hoisted(() => ({ track: vi.fn(), flush: async () => {}, clear: () => {}, settled: async () => {} }))
vi.mock('../../state/EventsContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useEvents: () => events,
}))

// «Para ti» de rappi-ia y lo ya mostrado viven en el módulo (lo que dura la pestaña): cada test, una pestaña nueva.
let HomeFeed
let Providers
let shownTopics
beforeEach(async () => {
  vi.resetModules()
  // De a uno (no en paralelo): así todos reciben el EventsContext de mentira.
  const eventsModule = await import('../../state/EventsContext')
  const demo = await import('../../state/DemoContext')
  const profile = await import('../../state/ProfileContext')
  const assistant = await import('../../state/AssistantContext')
  const cart = await import('../../state/CartContext')
  const address = await import('../../state/AddressContext')
  const toast = await import('../../components/Toast')
  const nudge = await import('../../state/NudgeContext')
  HomeFeed = (await import('./HomeFeed')).default
  shownTopics = eventsModule.shownTopics
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
})

beforeAll(() => {
  Element.prototype.scrollTo = () => {} // jsdom no lo implementa (carruseles)
})
afterAll(() => {
  delete Element.prototype.scrollTo
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

const tracked = (type) => events.track.mock.calls.filter(([name]) => name === type).map(([, fields]) => fields)
const pair = (fields) => `${fields.concept_id}|${fields.vertical}`
const forYouRow = () => document.querySelector('.for-you')

describe('«Para ti» de rappi-ia en la Home', () => {
  test('su sugerencia cuenta como tema ya sugerido en la sesión: el chat no la repite', async () => {
    api.health.mockResolvedValue({ voz: false })
    api.recommendations.mockResolvedValue({
      rows: [
        {
          reason: 'Porque te interesa 🍺 cerveza',
          concept: 'snacks-salados',
          vertical: 'supermercado',
          products: [{ id: 'cat-1', name: 'Papas Lays', price: '$1.990', store: 'Unimarc', vertical: 'supermercado' }],
        },
      ],
    })
    render(<HomeFeed push={() => {}} />, { wrapper: Providers })

    await waitFor(() => expect(screen.getByText('Papas Lays')).toBeTruthy())
    await waitFor(() => expect(shownTopics()).toEqual(['snacks-salados']))
  })
})

describe('«Para ti» local en la Home (sin fila de rappi-ia)', () => {
  test('con la API arriba y nada aprendido, la fila local cuenta como mostrada: lo aceptado ahí tiene su mostrada', async () => {
    api.health.mockResolvedValue({ voz: false })
    api.recommendations.mockResolvedValue({ rows: [] }) // usuario nuevo o tras «Olvidar»: el arranque de una demo
    render(<HomeFeed push={() => {}} />, { wrapper: Providers })
    await waitFor(() => expect(tracked('suggestion_shown').length).toBeGreaterThan(0))
    expect(tracked('suggestion_shown').map((fields) => fields.payload)).toEqual(
      tracked('suggestion_shown').map(() => ({ origen: 'para-ti-local' })),
    )

    const [add] = within(forYouRow()).getAllByLabelText(/^Agregar /)
    fireEvent.click(add)
    const accepted = tracked('suggestion_accepted')
    expect(accepted).toEqual([expect.objectContaining({ payload: { origen: 'para-ti-local' } })])
    expect(tracked('suggestion_shown').map(pair)).toContain(pair(accepted[0]))
  })

  test('mientras llega la fila de rappi-ia, la local (provisoria) no cuenta como mostrada', async () => {
    let answer
    api.health.mockResolvedValue({ voz: false })
    api.recommendations.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    render(<HomeFeed push={() => {}} />, { wrapper: Providers })
    await waitFor(() => expect(api.recommendations).toHaveBeenCalled())
    expect(within(forYouRow()).getAllByLabelText(/^Agregar /).length).toBeGreaterThan(0) // la local, en pantalla
    expect(tracked('suggestion_shown')).toEqual([])

    answer({
      rows: [
        {
          reason: 'Porque te interesa 🍺 cerveza',
          concept: 'snacks-salados',
          vertical: 'supermercado',
          products: [{ id: 'cat-1', name: 'Papas Lays', price: '$1.990', store: 'Unimarc', vertical: 'supermercado' }],
        },
      ],
    })
    await waitFor(() => expect(tracked('suggestion_shown')).toHaveLength(1))
    expect(tracked('suggestion_shown')[0]).toMatchObject({
      concept_id: 'snacks-salados',
      payload: { origen: 'para-ti' },
    })
  })

  test('lo que se acepta de la fila local mientras llega la de rappi-ia queda con su mostrada', async () => {
    // La espera dura el /health y el /recommendations (hasta 8 s), y el «+» de la fila local funciona igual.
    let answer
    api.health.mockResolvedValue({ voz: false })
    api.recommendations.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    render(<HomeFeed push={() => {}} />, { wrapper: Providers })
    await waitFor(() => expect(api.recommendations).toHaveBeenCalled())

    fireEvent.click(within(forYouRow()).getAllByLabelText(/^Agregar /)[0])
    answer({
      rows: [
        {
          reason: 'Porque te interesa 🍺 cerveza',
          concept: 'snacks-salados',
          vertical: 'supermercado',
          products: [{ id: 'cat-1', name: 'Papas Lays', price: '$1.990', store: 'Unimarc', vertical: 'supermercado' }],
        },
      ],
    })
    await waitFor(() => expect(screen.getByText('Papas Lays')).toBeTruthy())

    const [accepted] = tracked('suggestion_accepted')
    expect(accepted).toMatchObject({ payload: { origen: 'para-ti-local' } })
    const shownLocal = tracked('suggestion_shown').filter((fields) => fields.payload.origen === 'para-ti-local')
    expect(shownLocal.map(pair)).toEqual([pair(accepted)])
  })
})

describe('RappiFavor en la Home', () => {
  test('en «Rappi hoy» sigue no disponible, como en la app; en «Propuesta» abre su pantalla', async () => {
    api.health.mockResolvedValue(null)
    const push = vi.fn()
    localStorage.setItem('rappi-proto-demo-mode', 'actual')
    const { unmount } = render(
      <Providers>
        <HomeFeed push={push} />
      </Providers>,
    )
    expect(screen.getByLabelText('RappiFavor (no disponible)')).toBeTruthy()
    unmount()

    localStorage.setItem('rappi-proto-demo-mode', 'propuesta')
    render(
      <Providers>
        <HomeFeed push={push} />
      </Providers>,
    )
    fireEvent.click(screen.getByText('RappiFavor'))
    expect(push).toHaveBeenCalledWith('favor')
  })
})
