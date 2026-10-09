import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { getFallbacks, loadAnalytics, refreshSource, retryConnection, subscribeConnection } from './api.js'
import savedKpis from '../fixtures/kpis.synthetic.json'
import savedWeekly from '../fixtures/weekly.synthetic.json'
import savedCatalog from '../fixtures/catalog.json'

const jsonResponse = (body, status = 200) => ({ ok: status < 400, status, json: async () => body })

describe('loadAnalytics', () => {
  beforeEach(() => {
    retryConnection()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test('usa la API cuando responde', async () => {
    const live = { source: 'synthetic', data: { usuarios_activos: 7 } }
    const fetchMock = vi.fn(async () => jsonResponse(live))
    vi.stubGlobal('fetch', fetchMock)

    const result = await loadAnalytics('kpis', 'synthetic')

    expect(result).toEqual({ data: { usuarios_activos: 7 }, offline: false })
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/analytics/kpis?source=synthetic')
    expect(getFallbacks()).toEqual([])
  })

  test('si la API no responde usa los datos guardados y anota la consulta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    const listener = vi.fn()
    const unsubscribe = subscribeConnection(listener)

    const result = await loadAnalytics('kpis', 'synthetic')

    expect(result).toEqual({ data: savedKpis.data, offline: true })
    expect(getFallbacks()).toEqual([{ key: 'kpis.synthetic', name: 'kpis', reason: 'no responde' }])
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  test('una consulta lenta cae a los datos guardados con el motivo', async () => {
    const timeout = new DOMException('signal timed out', 'TimeoutError')
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(timeout)))

    const result = await loadAnalytics('weekly', 'synthetic')

    expect(result.data).toEqual(savedWeekly.data)
    expect(getFallbacks()[0].reason).toBe('no respondió en 30 s')
  })

  test('un error HTTP también cae a los datos guardados', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ detail: 'boom' }, 500)))

    const result = await loadAnalytics('catalog')

    expect(result).toEqual({ data: savedCatalog.data, offline: true })
    expect(getFallbacks()[0]).toMatchObject({ name: 'catalog', reason: 'respondió 500' })
  })

  test('descarta una respuesta de otra fuente (nunca mezcla simulados con prototipo)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ source: 'synthetic', data: [{ x: 1 }] })))

    const result = await loadAnalytics('funnel', 'prototype')

    expect(result.offline).toBe(true)
    expect(result.data).not.toEqual([{ x: 1 }])
    expect(getFallbacks()[0].reason).toBe('respuesta no válida')
  })

  test('guarda en caché por métrica y fuente, y retryConnection la limpia', async () => {
    const fetchMock = vi.fn(async (url) => jsonResponse({ source: new URL(url).searchParams.get('source'), data: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await loadAnalytics('trends', 'synthetic')
    await loadAnalytics('trends', 'synthetic')
    await loadAnalytics('trends', 'prototype')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    retryConnection()
    await loadAnalytics('trends', 'synthetic')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  test('refreshSource vuelve a pedir lo de esa fuente y deja en caché lo demás (sin repetir weekly)', async () => {
    const fetchMock = vi.fn(async (url) => jsonResponse({ source: new URL(url).searchParams.get('source'), data: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await loadAnalytics('suggestions', 'prototype')
    await loadAnalytics('weekly', 'synthetic')
    refreshSource('prototype')
    await loadAnalytics('suggestions', 'prototype')
    await loadAnalytics('weekly', 'synthetic')

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:8000/analytics/suggestions?source=prototype',
      'http://localhost:8000/analytics/weekly?source=synthetic',
      'http://localhost:8000/analytics/suggestions?source=prototype',
    ])
  })

  test('refreshSource olvida el aviso sin conexión de esa fuente y avisa', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    await loadAnalytics('suggestions', 'prototype')
    await loadAnalytics('kpis', 'synthetic')
    const listener = vi.fn()
    const unsubscribe = subscribeConnection(listener)

    refreshSource('prototype')

    expect(getFallbacks().map((fallback) => fallback.key)).toEqual(['kpis.synthetic'])
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  test('rechaza fuentes desconocidas', () => {
    expect(() => loadAnalytics('kpis', 'real')).toThrow('Fuente desconocida')
  })
})
