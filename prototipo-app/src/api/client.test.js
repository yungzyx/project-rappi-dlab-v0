import { afterEach, describe, expect, test, vi } from 'vitest'
import { health, resetHealthCache, toMessage, toPrototypeProduct } from './client'

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
    expect(message.suggestion).toMatchObject({ vertical: 'grocery', concept: 'snacks-salados' })
    expect(message.suggestion.products[0].fromSuggestion).toBe(true)
    expect(message.actions[0]).toEqual({ label: 'Pedir de un restaurante', ask: { text: 'pizza', vertical: 'restaurantes' } })
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
