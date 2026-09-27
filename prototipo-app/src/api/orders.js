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

/** Líneas del carrito → pedidos por vertical. Los productos de las capturas usan su id local ("proto:…"). */
export function buildOrders(items, { userId, sessionId, cartId }) {
  const byVertical = new Map()
  for (const { product, qty } of items) {
    const vertical = product.vertical ?? 'otro'
    const line = {
      entity_type: product.entityType === 'menu_item' ? 'menu_item' : 'catalog_item',
      entity_id: product.entityId ?? `proto:${product.id}`,
      concept_id: conceptOf(product),
      qty,
      unit_price: parsePrice(product.price) || undefined,
      from_suggestion: Boolean(product.fromSuggestion),
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
