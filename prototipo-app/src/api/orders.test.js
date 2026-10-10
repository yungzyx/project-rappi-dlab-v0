import { describe, expect, test } from 'vitest'
import { ALL_PRODUCTS } from '../data/catalog'
import { toPrototypeProduct } from './client'
import { buildOrders, conceptOf } from './orders'
import { fixture } from './testing'

const ctx = { userId: 'proto-1', sessionId: 's-1', cartId: 'c-1' }
// Verticales que acepta POST /orders (códigos del backend).
const ACCEPTED = [
  'supermercado',
  'licores',
  'farmacia',
  'mall',
  'conveniencia',
  'turbo',
  'chocolateria',
  'restaurantes',
]
// Un producto del catálogo local (el de Mochi y el buscador), con el formato de las capturas.
const HEINEKEN = {
  id: 'p-heineken',
  name: 'Heineken Cerveza Lager Original en Botella',
  price: '$6.690',
  store: 'Líquidos',
  vertical: 'liquor',
}

describe('pedidos para el panel', () => {
  test('un pedido por vertical; los productos de la API conservan sus ids', () => {
    const orders = buildOrders(
      [
        {
          product: {
            id: 'cat-200',
            entityType: 'catalog_item',
            entityId: '200',
            concept: 'cerveza',
            vertical: 'licores',
            price: '$1.290',
          },
          qty: 2,
        },
        {
          product: {
            id: 'cat-100',
            entityType: 'catalog_item',
            entityId: '100',
            concept: 'snacks-salados',
            vertical: 'supermercado',
            price: '$1.990',
            fromSuggestion: true,
          },
          qty: 1,
        },
      ],
      ctx,
    )
    expect(orders.map((o) => o.vertical)).toEqual(['licores', 'supermercado'])
    expect(orders[0].lines[0]).toEqual({
      entity_type: 'catalog_item',
      entity_id: '200',
      concept_id: 'cerveza',
      qty: 2,
      unit_price: 1290,
      from_suggestion: false,
    })
    expect(orders[1].lines[0].from_suggestion).toBe(true)
  })

  test('el pedido manda la vertical del backend y el entity_id real', () => {
    const item = toPrototypeProduct(fixture('catalog-product'))
    const dish = toPrototypeProduct(fixture('catalog-menu').sections[0].items[0])
    const orders = buildOrders(
      [
        { product: item, qty: 2 },
        { product: dish, qty: 1 },
      ],
      ctx,
    )
    expect(orders.map((o) => o.vertical)).toEqual(['supermercado', 'restaurantes'])
    expect(orders[0].lines[0]).toMatchObject({ entity_type: 'catalog_item', entity_id: '91001', qty: 2, unit_price: 1990 })
    expect(orders[1].lines[0]).toMatchObject({ entity_type: 'menu_item', entity_id: '98002', unit_price: 8990 })

    // Cada vertical de la API vuelve a ella tal cual, pase por la pantalla que pase.
    ACCEPTED.forEach((vertical) => {
      const [order] = buildOrders([{ product: toPrototypeProduct({ ...fixture('catalog-product'), vertical }), qty: 1 }], ctx)
      expect(order.vertical).toBe(vertical)
    })
    // Si la vertical del backend y la de la pantalla no coinciden, manda la del backend.
    const [turbo] = buildOrders([{ product: { ...item, vertical: 'express', backendVertical: 'turbo' }, qty: 1 }], ctx)
    expect(turbo.vertical).toBe('turbo')
  })

  test('los productos de las capturas usan su id local y el concepto de sus temas', () => {
    const [order] = buildOrders([{ product: HEINEKEN, qty: 1 }], ctx)
    expect(order.vertical).toBe('licores')
    expect(order.lines[0]).toMatchObject({ entity_id: 'proto:p-heineken', concept_id: 'cerveza' })
    expect(conceptOf({ name: 'Producto sin temas' })).toBeUndefined()
  })

  test('el concepto explícito de un producto manda sobre el de su tema', () => {
    // El tema "carne" incluye tuto, trutro y nuggets de pollo; "belleza", los perfumes.
    const tuto = { name: 'Super Pollo Tuto Corto de Pollo Congelado' }
    expect(conceptOf(tuto)).toBe('carnes')
    expect(conceptOf({ ...tuto, concept: 'pollo' })).toBe('pollo')
    const perfume = { name: 'Ck In2u Men 50 Edt Ml' }
    expect(conceptOf(perfume)).toBe('maquillaje')
    expect(conceptOf({ ...perfume, concept: 'fragancias' })).toBe('fragancias')
    // El pollo frito de restaurante no es el del súper.
    expect(conceptOf({ name: 'Wow Bucket de KFC' })).toBe('pollo-preparado')
  })

  test('todo producto del catálogo local llega con una vertical que la API acepta', () => {
    const orders = buildOrders(
      ALL_PRODUCTS.map((product) => ({ product, qty: 1 })),
      ctx,
    )
    expect(orders.flatMap((order) => order.lines)).toHaveLength(ALL_PRODUCTS.length)
    orders.forEach((order) => expect(ACCEPTED).toContain(order.vertical))
  })

  test('sin vertical del catálogo la línea no se envía; el resto sí, y la misma vertical es un solo pedido', () => {
    const orders = buildOrders(
      [
        { product: { id: 'pet-1', name: 'Snack para perro', vertical: 'pet', price: '$2.000' }, qty: 1 },
        { product: { id: 'sin-tienda', name: 'Algo', price: '$1.000' }, qty: 1 },
        { product: HEINEKEN, qty: 1 },
        { product: { id: 'cat-200', entityId: '200', vertical: 'licores', price: '$1.290' }, qty: 1 },
      ],
      ctx,
    )
    expect(orders).toHaveLength(1)
    expect(orders[0].vertical).toBe('licores')
    expect(orders[0].lines.map((line) => line.entity_id)).toEqual(['proto:p-heineken', '200'])
  })

  test('from_suggestion sale de la línea del carrito', () => {
    const [order] = buildOrders([{ product: HEINEKEN, qty: 1, fromSuggestion: true }], ctx)
    expect(order.lines[0].from_suggestion).toBe(true)
  })
})
