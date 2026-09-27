import { afterEach, describe, expect, test, vi } from 'vitest'
import { beaconEvents, chatVoice, health, resetHealthCache, toMessage, toPrototypeProduct } from './client'

const API_PRODUCT = {
  id: 'cat-200',
  entity_type: 'catalog_item',
  entity_id: '200',
  name: 'Cerveza Escudo Lata 470 cc',
  vertical: 'licores',
  concept: 'cerveza',
  price: '$1.290',
  price_value: 1290,
  before: '$1.590',
  discount: '-19%',
  store: 'Botillería',
  img: 'https://images.rappi.cl/products/escudo.png',
  age_restricted: true,
}

afterEach(() => {
  vi.unstubAllGlobals()
  resetHealthCache()
})

describe('de la API al prototipo', () => {
  test('un producto conserva los ids del catálogo real para eventos y pedidos', () => {
    const product = toPrototypeProduct(API_PRODUCT)
    expect(product).toMatchObject({ id: 'cat-200', price: '$1.290', discount: '-19%', entityId: '200', concept: 'cerveza' })
    expect(product.ageRestricted).toBe(true)
  })

  test('la sugerencia cruzada va aparte, marcada, y las aclaraciones vuelven a preguntar', () => {
    const message = toMessage({
      text: 'Mira estas opciones',
      products: [API_PRODUCT],
      reason: 'Porque llevas 🍺 cerveza',
      suggestion: { reason: 'Porque llevas 🍺 cerveza', concept: 'snacks-salados', vertical: 'supermercado', prototype_vertical: 'grocery', products: [API_PRODUCT] },
      actions: [{ label: 'Pedir de un restaurante', query: 'pizza', vertical: 'restaurantes' }],
      intent: { concepts: ['cerveza'] },
      unmet: false,
    })
    expect(message.source).toBe('api')
    expect(message.reason).toBeNull() // la razón se muestra con la sugerencia, no dos veces
    expect(message.suggestion).toMatchObject({ vertical: 'supermercado', concept: 'snacks-salados' })
    expect(message.suggestion.products[0].fromSuggestion).toBe(true)
    expect(message.actions[0]).toEqual({ label: 'Pedir de un restaurante', ask: { text: 'pizza', vertical: 'restaurantes' } })
  })

  test('la sugerencia se registra con el código del backend: Turbo no se confunde con conveniencia', () => {
    const message = toMessage({ text: 'Mira', suggestion: { concept: 'snacks-salados', vertical: 'turbo', prototype_vertical: 'express', products: [] } })
    expect(message.suggestion.vertical).toBe('turbo')
  })

  test('el aviso +18 viaja al mensaje y a cada tarjeta', () => {
    const message = toMessage({ text: 'Mira', products: [API_PRODUCT], age_notice: true })
    expect(message.ageNotice).toBe(true)
    expect(message.products[0].ageRestricted).toBe(true)
  })
})

describe('health', () => {
  test('sin API responde null (el prototipo usa su cerebro local) y lo cachea', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    expect(await health()).toBeNull()
    expect(await health()).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('con API devuelve sus capacidades', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, capacidades: { voz: true, fotos: false } }) }))
    expect(await health({ force: true })).toEqual({ voz: true, fotos: false })
  })
})

describe('envíos', () => {
  test('al cerrar la pestaña los eventos van como text/plain a /events/beacon (sin preflight CORS)', async () => {
    const sendBeacon = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true })
    try {
      expect(beaconEvents('proto-1', [{ type: 'app_open', session_id: 's-1' }])).toBe(true)
      const [url, blob] = sendBeacon.mock.calls[0]
      expect(url).toMatch(/\/events\/beacon$/)
      expect(blob.type).toBe('text/plain')
      expect(JSON.parse(await blob.text())).toEqual({ user_id: 'proto-1', events: [{ type: 'app_open', session_id: 's-1' }] })
    } finally {
      delete navigator.sendBeacon
    }
  })

  test('la voz se puede cancelar: la señal aborta la subida', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('abortado'))))),
    )
    const controller = new AbortController()
    const pending = chatVoice(new Blob(['x']), { user_id: 'proto-1' }, { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toThrow('abortado')
  })
})
