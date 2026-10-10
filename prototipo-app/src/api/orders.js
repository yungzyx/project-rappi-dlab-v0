// Pedidos del prototipo → rappi-ia: un pedido por vertical (como en Rappi, un pedido es de una tienda).
import { parsePrice } from '../state/CartContext'

/** Concepto de un producto: el que trae de la API (`concept`); sin él, el evento y el pedido van sin concepto. */
export const conceptOf = (product) => product.concept

/** Campos de un evento de carro (agregar, quitar, vaciar) para rappi-ia; `qty` = unidades del evento. */
export function cartEventFields(item, cartId, { qty } = {}) {
  return {
    cart_id: cartId,
    vertical: item.vertical,
    concept_id: conceptOf(item),
    entity_type: item.entityType,
    entity_id: item.entityId,
    value: parsePrice(item.price) || undefined,
    payload: { ...(item.fromSuggestion ? { from_suggestion: true } : {}), ...(qty ? { qty } : {}) },
  }
}

// Verticales que acepta POST /orders. El pedido va con el código del backend: así un producto con
// `backendVertical: 'licores'` y otro con `vertical: 'liquor'` de la misma vertical forman un solo pedido.
const BACKEND_VERTICALS = {
  grocery: 'supermercado',
  liquor: 'licores',
  pharmacy: 'farmacia',
  retail: 'mall',
  express: 'conveniencia',
  chocolates: 'chocolateria',
  restaurants: 'restaurantes',
}
const BACKEND_CODES = new Set([...Object.values(BACKEND_VERTICALS), 'turbo'])
const orderVertical = (vertical) => (BACKEND_CODES.has(vertical) ? vertical : BACKEND_VERTICALS[vertical])

/**
 * Líneas del carrito → pedidos por vertical. Todo producto trae su `entityId` real de la API: una línea sin él no
 * existe (nunca se inventa un id) y se descarta con un aviso en desarrollo. Un producto sin vertical del catálogo
 * sigue en el carrito de la demo, pero no se envía: la API rechazaría el pedido completo.
 */
export function buildOrders(items, { userId, sessionId, cartId }) {
  const byVertical = new Map()
  for (const { product, qty, fromSuggestion } of items) {
    const vertical = orderVertical(product.backendVertical ?? product.vertical)
    if (!vertical) continue
    if (product.entityId == null) {
      if (import.meta.env.DEV) console.warn(`Línea sin entityId descartada del pedido: ${product.name ?? product.id}`)
      continue
    }
    const line = {
      entity_type: product.entityType === 'menu_item' ? 'menu_item' : 'catalog_item',
      entity_id: product.entityId,
      concept_id: conceptOf(product),
      qty,
      unit_price: parsePrice(product.price) || undefined,
      from_suggestion: Boolean(fromSuggestion ?? product.fromSuggestion),
    }
    byVertical.set(vertical, [...(byVertical.get(vertical) ?? []), line])
  }
  return [...byVertical].map(([vertical, lines]) => ({
    user_id: userId,
    session_id: sessionId,
    cart_id: cartId,
    vertical,
    lines,
  }))
}
