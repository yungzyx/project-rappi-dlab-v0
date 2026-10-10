// Índice del catálogo transcrito de las capturas (`transcribedCatalog.js` y `verticalCatalog.js`).
// Ninguna pantalla lo lee: las pantallas muestran la API (`/catalog`, ver `api/catalog.js`). Queda solo para el buscador
// local (`components/search`) y el cerebro local de Mochi (`assistant/`, `screens/home/live`), y se va con ellos en la etapa 3.
import {
  BEST_GROCERY,
  BEST_RESTAURANTS,
  CRAZY_DEALS,
  GROCERY_SECTIONS,
  LOWER_FEES,
  MOST_ORDERED,
  NEARBY_STORES,
  NEW_IN_RAPPI,
  TOP_PIZZAS,
  TURBO_RESTAURANTS,
} from './transcribedCatalog'
import { VERTICAL_PRODUCTS, VERTICAL_STORES } from './verticalCatalog'

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
  ...NEARBY_STORES.map((store) => ({ ...store, eta: store.when, etaIcon: store.scheduled ? 'clock' : 'bolt', logo: true })),
])

export const ALL_PRODUCTS = [
  ...CRAZY_DEALS,
  ...TOP_PIZZAS,
  ...GROCERY_SECTIONS.flatMap((section) => section.products),
  ...VERTICAL_PRODUCTS,
]

const normalize = (text) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

export function findStore(name) {
  return ALL_STORES.find((store) => normalize(store.name) === normalize(name))
}

/** Tienda del índice local para armar su página desde un producto local de Mochi o de la Home; la busca por nombre. */
export function storeFor({ name }) {
  return findStore(name)
}

// Tope de resultados: una letra suelta calza con casi todo el catálogo.
export const MAX_STORE_RESULTS = 10
export const MAX_PRODUCT_RESULTS = 30

/** Primeros `limit` elementos que cumplen `test` (sin recorrer el resto). */
function take(items, test, limit) {
  const found = []
  for (const item of items) {
    if (found.length >= limit) break
    if (test(item)) found.push(item)
  }
  return found
}

/**
 * Búsqueda simple por palabras (sin tildes): todas las palabras deben aparecer en el nombre o la tienda.
 * Devuelve a lo más MAX_STORE_RESULTS tiendas y MAX_PRODUCT_RESULTS productos, en el orden del catálogo.
 */
export function search(query) {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return { stores: [], products: [] }
  const matches = (text) => words.every((word) => normalize(text).includes(word))
  return {
    stores: take(ALL_STORES, (store) => matches(store.name), MAX_STORE_RESULTS),
    products: take(ALL_PRODUCTS, (product) => matches(`${product.name} ${product.store}`), MAX_PRODUCT_RESULTS),
  }
}
