import { describe, expect, test } from 'vitest'
import { buildOrders, conceptOf } from './orders'

const ctx = { userId: 'proto-1', sessionId: 's-1', cartId: 'c-1' }

describe('pedidos para el panel', () => {
  test('un pedido por vertical; los productos de la API conservan sus ids', () => {
    const orders = buildOrders(
      [
        { product: { id: 'cat-200', entityType: 'catalog_item', entityId: '200', concept: 'cerveza', vertical: 'licores', price: '$1.290' }, qty: 2 },
        { product: { id: 'cat-100', entityType: 'catalog_item', entityId: '100', concept: 'snacks-salados', vertical: 'supermercado', price: '$1.990', fromSuggestion: true }, qty: 1 },
      ],
      ctx,
    )
    expect(orders.map((o) => o.vertical)).toEqual(['licores', 'supermercado'])
    expect(orders[0].lines[0]).toEqual({ entity_type: 'catalog_item', entity_id: '200', concept_id: 'cerveza', qty: 2, unit_price: 1290, from_suggestion: false })
    expect(orders[1].lines[0].from_suggestion).toBe(true)
  })

  test('los productos de las capturas usan su id local y el concepto de sus temas', () => {
    const [order] = buildOrders([{ product: { id: 'p-heineken', name: 'Cerveza Heineken', price: '$6.690' }, qty: 1 }], ctx)
    expect(order.vertical).toBe('otro')
    expect(order.lines[0]).toMatchObject({ entity_id: 'proto:p-heineken', concept_id: 'cerveza' })
    expect(conceptOf({ name: 'Producto sin temas' })).toBeUndefined()
  })
})
