// Productos de Turbo: lo que el catálogo local tiene de súper, express, botillería y farmacia (sin restaurantes).
import { ALL_PRODUCTS } from '../../data/catalog'

const TURBO_VERTICALS = new Set(['grocery', 'express', 'liquor', 'pharmacy'])

export const TURBO_PRODUCTS = ALL_PRODUCTS.filter((product) => TURBO_VERTICALS.has(product.vertical))

// Palabras clave de cada pestaña (sin tildes, en minúsculas). «Todo» no filtra.
const TAB_KEYWORDS = {
  frescos: ['palta', 'zapallo', 'pollo', 'carne', 'fruta', 'verdura', 'naranja', 'mandarina', 'habas'],
  despensa: ['arroz', 'fideos', 'aceite', 'harina', 'azucar', 'leche', 'pan', 'pañal', 'pampers', 'gel', 'pomada'],
  picoteo: ['papas', 'chocolate', 'botana', 'cerveza', 'snack', 'nuggets', 'vino', 'cabernet'],
  home: ['hogar', 'limpieza', 'detergente', 'papel', 'toallitas'],
}

const MIN_PER_TAB = 6

const normalize = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Productos de una pestaña: los que calzan con sus palabras clave y, si son pocos, se rellena con «Todo». */
export function productsForTab(tab) {
  const keywords = TAB_KEYWORDS[tab]
  if (!keywords) return TURBO_PRODUCTS
  const matches = TURBO_PRODUCTS.filter((product) => keywords.some((word) => normalize(product.name).includes(word)))
  if (matches.length >= MIN_PER_TAB) return matches
  const rest = TURBO_PRODUCTS.filter((product) => !matches.includes(product))
  return [...matches, ...rest.slice(0, MIN_PER_TAB - matches.length)]
}

/** Productos con descuento (pestaña Offers). */
export const TURBO_OFFERS = TURBO_PRODUCTS.filter((product) => product.discount)
