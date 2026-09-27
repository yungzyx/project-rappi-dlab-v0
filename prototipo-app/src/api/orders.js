// Pedidos del prototipo → rappi-ia: un pedido por vertical (como en Rappi, un pedido es de una tienda).
import { parsePrice } from '../state/CartContext'
import { productTags } from '../assistant/tags'

// Temas del prototipo → conceptos de rappi-ia (para productos de las capturas, que no vienen de la API).
export const TAG_TO_CONCEPT = {
  cerveza: 'cerveza',
  vino: 'vino',
  licor: 'licores',
  snack: 'snacks-salados',
  dulce: 'chocolates',
  pizza: 'pizza',
  hamburguesa: 'hamburguesa',
  pollo: 'pollo',
  sushi: 'sushi',
  bebe: 'panales',
  farmacia: 'dermocosmetica',
  belleza: 'maquillaje',
  mascota: 'alimento-perro',
  fresco: 'frutas',
  carne: 'carnes',
}

/** Conceptos de un producto: el de la API si viene de ahí; si no, el de sus temas locales. */
export function conceptOf(product) {
  if (product.concept) return product.concept
  const [tag] = productTags(product)
  return tag ? TAG_TO_CONCEPT[tag] : undefined
}

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

// Verticales que acepta POST /orders. El pedido va con el código del backend: así un producto de la API
// ('licores') y uno de las capturas ('liquor') de la misma vertical forman un solo pedido.
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
 * Líneas del carrito → pedidos por vertical. Los productos de las capturas usan su id local ("proto:…").
 * Un producto sin vertical del catálogo (p. ej. de una tienda de mascotas) sigue en el carrito de la demo,
 * pero no se envía: la API rechazaría el pedido completo.
 */
export function buildOrders(items, { userId, sessionId, cartId }) {
  const byVertical = new Map()
  for (const { product, qty, fromSuggestion } of items) {
    const vertical = orderVertical(product.vertical)
    if (!vertical) continue
    const line = {
      entity_type: product.entityType === 'menu_item' ? 'menu_item' : 'catalog_item',
      entity_id: product.entityId ?? `proto:${product.id}`,
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
