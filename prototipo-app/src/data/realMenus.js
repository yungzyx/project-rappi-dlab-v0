// Menús reales de Rappi Chile sacados del scraper (scripts/export-menus.sh). El JSON está fuera de git:
// si no existe, import.meta.glob devuelve {} y la app funciona sin estos restaurantes.
// Las fotos se cargan desde images.rappi.cl, así que se ven solo con internet.
import { formatPrice } from '../state/CartContext'

const files = import.meta.glob('./generated/menus.json', { eager: true, import: 'default' })
const raw = files['./generated/menus.json'] ?? []

// Supuesto: varios locales no traen tiempo de entrega en la página pública.
const DEFAULT_ETA = '30 min'

/** "Vapiano - Las Condes" → { name: "Vapiano", area: "Las Condes" } */
function splitName(fullName) {
  const cut = fullName.lastIndexOf(' - ')
  return cut === -1 ? { name: fullName, area: '' } : { name: fullName.slice(0, cut), area: fullName.slice(cut + 3) }
}

function toDish(item, store) {
  const hasDiscount = item.realPrice > item.price
  return {
    id: `menu-${item.id}`,
    name: item.name,
    description: item.description,
    img: item.image,
    popular: item.popular,
    price: formatPrice(Math.round(item.price)),
    before: hasDiscount ? formatPrice(Math.round(item.realPrice)) : undefined,
    discount: hasDiscount ? `-${Math.round(item.discount)}%` : undefined,
    store: store.name,
    storeLogo: store.img,
    eta: store.eta,
    etaIcon: 'bolt',
  }
}

function toRestaurant(restaurant) {
  const { name, area } = splitName(restaurant.name)
  const items = restaurant.sections.flatMap((section) => section.items)
  // Sin logo ni portada en la base: la foto del plato más popular hace de portada.
  const cover = (items.find((item) => item.popular && item.image) ?? items.find((item) => item.image))?.image
  const store = {
    id: `real-${restaurant.id}`,
    name,
    area,
    img: cover,
    real: true,
    rating: restaurant.rating ? Number(restaurant.rating).toFixed(1) : undefined,
    // La base guarda un texto vacío cuando la página no trae tiempo: || y no ??.
    eta: restaurant.eta || DEFAULT_ETA,
    etaIcon: 'bolt',
    deliveryLabel: restaurant.deliveryCost > 0 ? undefined : 'FREE DELIVERY',
    fee: restaurant.deliveryCost > 0 ? formatPrice(restaurant.deliveryCost) : undefined,
    distance: area,
  }
  return {
    ...store,
    sections: restaurant.sections.map((section) => ({
      name: section.name,
      items: section.items.filter((item) => item.price != null).map((item) => toDish(item, store)),
    })),
  }
}

export const REAL_RESTAURANTS = raw.map(toRestaurant)

export const REAL_DISHES = REAL_RESTAURANTS.flatMap((restaurant) => restaurant.sections.flatMap((section) => section.items))
