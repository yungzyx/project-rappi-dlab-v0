// Temas de interés del asistente. Cada producto, tienda o frase se etiqueta buscando estas palabras.
import { ALL_PRODUCTS, ALL_STORES } from '../data/catalog'

export const TAGS = {
  cerveza: { label: 'Cerveza', emoji: '🍺', words: ['cerveza', 'beer', 'lager', 'pale ale', 'heineken', 'royal guard', 'budweiser', 'cristal', 'jester', 'kunstmann', 'chela'] },
  vino: { label: 'Vino', emoji: '🍷', words: ['vino', 'wine', 'cabernet', 'molina'] },
  licor: { label: 'Copete', emoji: '🥃', words: ['licor', 'pisco', 'whisky', 'liquor', 'botilleria', 'copete', 'liquidos', 'drinks', 'trago'] },
  snack: { label: 'Snacks', emoji: '🍿', words: ['snack', 'papas fritas', 'chips', 'kryzpo', 'marco polo', 'botana', 'picoteo'] },
  dulce: { label: 'Dulces', emoji: '🍫', words: ['chocolate', 'dulce', 'postre', 'sahne', 'caramel', 'pastel', 'dulceria', 'torta', 'altiro', 'entrelagos'] },
  pizza: { label: 'Pizza', emoji: '🍕', words: ['pizza', 'papa john'] },
  hamburguesa: { label: 'Hamburguesas', emoji: '🍔', words: ['burger', 'hamburguesa', 'mcdonald', 'miguelayo', 'relativo'] },
  pollo: { label: 'Pollo frito', emoji: '🍗', words: ['pollo frito', 'kfc', 'chicken', 'bucket', 'combo aniversario'] },
  sushi: { label: 'Sushi', emoji: '🍣', words: ['sushi', 'nikkei', 'poke', 'yapones', 'umami', 'ryge'] },
  bebe: { label: 'Bebé', emoji: '🍼', words: ['bebe', 'panal', 'pampers', 'guagua'] },
  // Sin síntomas ni "remedio": la salud es sensible y no se aprende ni se sugiere (docs/diseno-ia.md §4, regla 6).
  farmacia: { label: 'Farmacia', emoji: '💊', words: ['farmacia', 'ahumada', 'cruz verde', 'eucerin', 'cerave'] },
  belleza: { label: 'Belleza', emoji: '💄', words: ['belleza', 'beauty', 'perfume', 'ck in2u', 'clinique', 'labial', 'maquillaje', 'edt'] },
  mascota: { label: 'Mascotas', emoji: '🐶', words: ['mascota', 'perro', 'gato', 'pet', 'superzoo'] },
  fresco: { label: 'Frutas y verduras', emoji: '🥑', words: ['palta', 'fruta', 'verdura', 'naranja', 'mandarina', 'zapallo', 'habas', 'saludable', 'sano', 'detox'] },
  carne: { label: 'Carnes', emoji: '🥩', words: ['carne', 'asado', 'parrilla', 'tuto', 'trutro', 'nuggets de pollo', 'filetito'] },
}

// Qué recomendar al lado de cada interés: aquí se cruzan verticales (restaurantes ↔ súper ↔ botillería…).
export const COMPLEMENTS = {
  cerveza: ['snack', 'carne'],
  vino: ['dulce', 'fresco'],
  licor: ['snack', 'cerveza'],
  snack: ['cerveza'],
  carne: ['cerveza', 'fresco'],
  pizza: ['cerveza', 'dulce'],
  hamburguesa: ['cerveza', 'dulce'],
  pollo: ['cerveza', 'snack'],
  sushi: ['dulce', 'vino'],
  bebe: ['farmacia'],
  farmacia: ['fresco'],
  belleza: ['dulce'],
  mascota: ['snack'],
  fresco: ['carne'],
  dulce: ['vino'],
}

export const normalize = (text) =>
  String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ñ/g, 'n')

// Cada palabra clave calza como palabra completa, con plural opcional: "hamburguesa" reconoce
// "hamburguesas" y "papa john" reconoce "Papa Johns", pero "bebe" no calza con "bebestibles".
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const TAG_PATTERNS = Object.fromEntries(
  Object.entries(TAGS).map(([tag, { words }]) => [
    tag,
    new RegExp(`(^|[^a-z0-9])(${words.map(escapeRegex).join('|')})(s|es)?($|[^a-z0-9])`),
  ]),
)

export function tagsOf(text) {
  const clean = normalize(text)
  return Object.keys(TAGS).filter((tag) => TAG_PATTERNS[tag].test(clean))
}

// Los temas de un producto salen de su nombre; la tienda solo se usa si el nombre no dice nada
// (si no, una cerveza de "Botillería" también sería "copete" y "quiero whisky" mostraría cervezas).
export const productTags = (product) => {
  const own = tagsOf(product.name)
  return own.length > 0 ? own : tagsOf(product.store ?? '')
}
// Los productos con foto cortada en el borde de la captura no se ofrecen en el chat.
const complete = (product) => !product.partial

export function productsForTags(tags, limit = 8) {
  return ALL_PRODUCTS.filter((product) => complete(product) && productTags(product).some((tag) => tags.includes(tag))).slice(
    0,
    limit,
  )
}

export function storesForTags(tags, limit = 6) {
  return ALL_STORES.filter((store) => tagsOf(store.name).some((tag) => tags.includes(tag))).slice(0, limit)
}

const discountOf = (product) => Math.abs(parseInt(product.discount, 10)) || 0

export function topDiscounts(limit = 8) {
  return ALL_PRODUCTS.filter(complete)
    .sort((a, b) => discountOf(b) - discountOf(a))
    .slice(0, limit)
}

/** Ofertas sin saber qué busca: primero la mejor de cada vertical (si no, ganan los combos de restaurantes). */
export function variedDiscounts(limit = 8) {
  const sorted = topDiscounts(ALL_PRODUCTS.length)
  const seen = new Set()
  const firsts = sorted.filter((product) => !seen.has(product.vertical) && seen.add(product.vertical))
  return [...firsts, ...sorted.filter((product) => !firsts.includes(product))].slice(0, limit)
}
