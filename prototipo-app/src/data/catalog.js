// Índice de todo lo que muestra el prototipo, para el buscador y la página de tienda.
import { LOWER_FEES, MOST_ORDERED, NEW_IN_RAPPI, CRAZY_DEALS, TOP_PIZZAS, GROCERY_SECTIONS } from '../screens/deals/data'
import { TURBO_RESTAURANTS, NEARBY_STORES } from '../screens/home/data'
import { BEST_RESTAURANTS, BEST_GROCERY } from '../screens/favorites/data'
import { VERTICAL_PRODUCTS, VERTICAL_STORES } from '../screens/vertical/data'
import { REAL_DISHES, REAL_RESTAURANTS } from './realMenus'

function uniqueByName(items) {
  const seen = new Set()
  return items.filter((item) => {
    const key = item.name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Los restaurantes de las capturas no tienen productos con vertical que la delaten: se marcan aquí.
const restaurants = (stores) => stores.map((store) => ({ vertical: 'restaurants', ...store }))

export const ALL_STORES = uniqueByName([
  ...restaurants([
    ...TURBO_RESTAURANTS,
    ...LOWER_FEES,
    ...MOST_ORDERED,
    ...NEW_IN_RAPPI.filter((store) => !store.partial),
    ...BEST_RESTAURANTS,
  ]),
  ...BEST_GROCERY,
  ...VERTICAL_STORES,
  ...REAL_RESTAURANTS,
  ...NEARBY_STORES.map((store) => ({ ...store, eta: store.when, etaIcon: store.scheduled ? 'clock' : 'bolt', logo: true })),
])

export const ALL_PRODUCTS = [
  ...CRAZY_DEALS,
  ...TOP_PIZZAS,
  ...GROCERY_SECTIONS.flatMap((section) => section.products),
  ...VERTICAL_PRODUCTS,
  ...REAL_DISHES,
]

const normalize = (text) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

export function findStore(name) {
  return ALL_STORES.find((store) => normalize(store.name) === normalize(name))
}

export function productsOfStore(name) {
  return ALL_PRODUCTS.filter((product) => normalize(product.store) === normalize(name))
}

/** Vertical de una tienda (id del prototipo): la suya o, si no la trae, la de sus productos. */
export function storeVertical(store) {
  return store.vertical ?? productsOfStore(store.name).find((product) => product.vertical)?.vertical
}

/** Búsqueda simple por palabras (sin tildes): todas las palabras deben aparecer en el nombre o la tienda. */
export function search(query) {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return { stores: [], products: [] }
  const matches = (text) => words.every((word) => normalize(text).includes(word))
  return {
    stores: ALL_STORES.filter((store) => matches(store.name)),
    products: ALL_PRODUCTS.filter((product) => matches(`${product.name} ${product.store}`)),
  }
}
