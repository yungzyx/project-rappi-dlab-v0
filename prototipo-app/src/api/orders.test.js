import { describe, expect, test } from 'vitest'
import { ALL_PRODUCTS } from '../data/catalog'
import { REAL_DISHES } from '../data/realMenus'
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
const HEINEKEN = ALL_PRODUCTS.find((product) => product.id === 'p-heineken')

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

  test('pollo, verduras y perfumes de las capturas van con su concepto de la taxonomía, no con el de su tema', () => {
    const conceptOfId = (id) => conceptOf(ALL_PRODUCTS.find((product) => product.id === id))
    // El tema "carne" incluye tuto, trutro y nuggets de pollo; "fresco" el zapallo, y "belleza" los perfumes.
    expect(conceptOfId('p-superpollo')).toBe('pollo') // Super Pollo Tuto Corto
    expect(conceptOfId('p-kingnuggets')).toBe('pollo')
    expect(conceptOfId('p-sperpollo')).toBe('pollo')
    expect(conceptOfId('deal-wow-bucket')).toBe('pollo-preparado') // el pollo frito de restaurante no es el del súper
    expect(conceptOfId('p-zapallo')).toBe('verduras') // Zapallo en Cubo
    expect(conceptOfId('ret-ck')).toBe('fragancias') // Ck In2u Edt
    expect(conceptOfId('ret-abgold')).toBe('fragancias')
  })

  test('todo producto local (capturas y menús reales) llega con una vertical que la API acepta', () => {
    const orders = buildOrders(
      ALL_PRODUCTS.map((product) => ({ product, qty: 1 })),
      ctx,
    )
    expect(orders.flatMap((order) => order.lines)).toHaveLength(ALL_PRODUCTS.length)
    orders.forEach((order) => expect(ACCEPTED).toContain(order.vertical))
  })

  test('los platos de los menús reales van como menu_item, con el id del plato, a restaurantes', () => {
    const dish = REAL_DISHES[0]
    if (!dish) return // sin el JSON exportado no hay menús reales
    const [order] = buildOrders([{ product: dish, qty: 1 }], ctx)
    expect(order.vertical).toBe('restaurantes')
    expect(order.lines[0]).toMatchObject({ entity_type: 'menu_item', entity_id: dish.id.replace(/^menu-/, '') })
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
