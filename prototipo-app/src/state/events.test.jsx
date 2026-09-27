import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { DemoProvider } from './DemoContext'
import { EventsProvider, sessionId, useEvents, userId } from './EventsContext'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe('identidad seudónima y sesiones', () => {
  test('el id de usuario se conserva en este navegador', () => {
    const first = userId()
    expect(first).toMatch(/^proto-/)
    expect(userId()).toBe(first)
  })

  test('la sesión se renueva tras 30 minutos sin actividad', () => {
    const t0 = 1_000_000
    const a = sessionId(t0)
    expect(sessionId(t0 + 10 * 60 * 1000)).toBe(a)
    expect(sessionId(t0 + 10 * 60 * 1000 + 31 * 60 * 1000)).not.toBe(a)
  })
})

describe('eventos', () => {
  const setup = () =>
    renderHook(() => useEvents(), {
      wrapper: ({ children }) => (
        <DemoProvider>
          <EventsProvider>{children}</EventsProvider>
        </DemoProvider>
      ),
    })

  test('se envían en lote con el id del usuario y la sesión', async () => {
    const fetchMock = vi.fn(async (url) => ({ ok: true, json: async () => (String(url).endsWith('/health') ? { capacidades: {} } : { guardados: 2 }) }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = setup()
    act(() => result.current.track('search', { query: 'chelas', concept_id: 'cerveza' }))
    await act(() => result.current.flush())
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/events'))
    const body = JSON.parse(call[1].body)
    expect(body.user_id).toMatch(/^proto-/)
    expect(body.events.map((e) => e.type)).toEqual(['app_open', 'search'])
    expect(body.events[1]).toMatchObject({ query: 'chelas', concept_id: 'cerveza' })
  })

  test('en modo "Rappi hoy" los eventos van sin concepto: Bigotes no aprende', async () => {
    localStorage.setItem('rappi-proto-demo-mode', 'actual')
    const fetchMock = vi.fn(async (url) => ({ ok: true, json: async () => (String(url).endsWith('/health') ? { capacidades: {} } : {}) }))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = setup()
    act(() => result.current.track('cart_add', { concept_id: 'cerveza' }))
    await act(() => result.current.flush())
    const body = JSON.parse(fetchMock.mock.calls.find(([url]) => String(url).endsWith('/events'))[1].body)
    expect(body.events.find((e) => e.type === 'cart_add').concept_id).toBeUndefined()
  })
})
