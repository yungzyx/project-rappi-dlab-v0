import { afterEach, describe, expect, test, vi } from 'vitest'
import { beaconEvents, chat, health, resetHealthCache, toMessage, toPrototypeProduct } from './client'

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

  test('la sugerencia dice de qué vertical viene y a qué pantalla lleva', () => {
    const from = (vertical, prototypeVertical) =>
      toMessage({ text: 'Mira', suggestion: { concept: 'x', vertical, prototype_vertical: prototypeVertical, products: [] } }).suggestion
    expect(from('licores', 'liquor')).toMatchObject({ verticalLabel: 'Licores', route: ['vertical', { id: 'liquor' }] })
    expect(from('turbo', 'express')).toMatchObject({ verticalLabel: 'Turbo', route: ['turbo'] })
    expect(from('restaurantes', 'restaurants')).toMatchObject({ verticalLabel: 'Restaurantes', route: ['restaurants'] })
    expect(from('chocolateria', 'chocolates')).toMatchObject({ verticalLabel: 'Chocolatería', route: ['vertical', { id: 'chocolates' }] })
  })

  test('"también en": otras verticales con su nombre, su pantalla y sus tiendas', () => {
    const message = toMessage({
      text: 'Mira',
      also_in: {
        concept: 'cerveza',
        label: '🍺 Cerveza',
        verticals: [
          { vertical: 'supermercado', prototype_vertical: 'grocery', items: 262, stores: [{ name: 'Unimarc', logo: 'https://x/u.png' }] },
          { vertical: 'turbo', prototype_vertical: 'express', items: 50, stores: [{ name: 'Rappi Drinks', logo: null }] },
        ],
      },
    })
    expect(message.alsoIn.label).toBe('🍺 Cerveza')
    expect(message.alsoIn.verticals).toEqual([
      { label: 'Súper', route: ['vertical', { id: 'grocery' }], items: 262, stores: [{ name: 'Unimarc', logo: 'https://x/u.png' }] },
      { label: 'Turbo', route: ['turbo'], items: 50, stores: [{ name: 'Rappi Drinks', logo: null }] },
    ])
    expect(toMessage({ text: 'Mira' }).alsoIn).toBeNull()
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

  test('si el chat falla, la siguiente pregunta vuelve a revisar la API en vez de fiarse del caché', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ capacidades: { voz: true } }) })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ capacidades: { voz: true } }) })
    vi.stubGlobal('fetch', fetchMock)
    await health()
    await expect(chat({ message: 'cerveza' })).rejects.toThrow()

    await health()

    expect(fetchMock).toHaveBeenCalledTimes(3) // health, chat y health de nuevo (sin esperar los 30 s del caché)
  })
})

describe('chat', () => {
  test('se rinde a los 8 s: el cerebro local contesta antes de que el público note la espera', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('abortado'))))),
      )
      const pending = chat({ message: 'cerveza' })
      const outcome = expect(pending).rejects.toThrow('abortado')
      await vi.advanceTimersByTimeAsync(7999)
      await vi.advanceTimersByTimeAsync(1)
      await outcome
    } finally {
      vi.useRealTimers()
    }
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

})
