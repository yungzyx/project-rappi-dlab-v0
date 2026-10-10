// Índice de todo lo que muestra el prototipo, para el buscador y la página de tienda.
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

/**
 * Tienda de una página de tienda. Un restaurante real se busca por su id (dos sucursales pueden quedar con el mismo
 * nombre recortado) o por su nombre completo, que es como lo trae la API ("Délice - Las Condes"); el resto, por nombre.
 */
export function storeFor({ id, name }) {
  return (
    REAL_RESTAURANTS.find((store) => store.id === id) ??
    findStore(name) ??
    REAL_RESTAURANTS.find((store) => normalize(store.fullName) === normalize(name))
  )
}

export function productsOfStore(name) {
  return ALL_PRODUCTS.filter((product) => normalize(product.store) === normalize(name))
}

/** Vertical de una tienda (id del prototipo): la suya o, si no la trae, la de sus productos. */
export function storeVertical(store) {
  return store.vertical ?? productsOfStore(store.name).find((product) => product.vertical)?.vertical
}

// Tope de resultados: con los menús reales una letra suelta calza con miles de platos.
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
