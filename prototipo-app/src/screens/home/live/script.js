// Lo que Bigotes decide mostrar en la Home del prototipo final: una vertical que combina con lo agregado y kits por plan.
// Todo sale de los datos del prototipo; no hay chat ni llamadas a la API. Un ítem es un producto o una tienda.
import { COMPLEMENTS, TAGS, productsForTags, storesForTags } from '../../../assistant/tags'
import { VERTICAL_NAMES } from '../../../data/verticals'

// La salud no se aprende ni se sugiere (docs/diseno-ia.md §4, regla 6).
const NEVER_SUGGESTED = new Set(['farmacia', 'bebe'])
const DISCOVERY_FALLBACK = ['licor', 'vino', 'cerveza', 'belleza', 'mascota', 'snack']
const MIN_DISCOVERY_ITEMS = 2

const asProduct = (product) => ({ kind: 'product', key: `p-${product.id}`, vertical: product.vertical, product })
const asStore = (store) => ({ kind: 'store', key: `s-${store.name}`, vertical: store.vertical, store })

/** Productos y tiendas de un tema, con su vertical (los que no la traen no sirven para invitar a una). */
function itemsFor(tag, limit = 12) {
  return [...productsForTags([tag], 30).map(asProduct), ...storesForTags([tag], 12).map(asStore)]
    .filter((item) => item.vertical)
    .slice(0, limit)
}

const mostCommon = (values) => {
  const counts = new Map()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

// En la Home, Bigotes habla de «chocolates» (lo que la persona reconoce), no de la etiqueta interna «Dulces».
const SPOKEN_LABELS = { dulce: 'Chocolates' }
const describe = (tag) => ({ tag, label: SPOKEN_LABELS[tag] ?? TAGS[tag].label, emoji: TAGS[tag].emoji })

/** Una vertical distinta de la de `interest` ({ tag, vertical }), con cosas que combinan con él: lo que se invita a descubrir. */
export function discoveryFor(interest) {
  if (NEVER_SUGGESTED.has(interest.tag)) return null // lo de salud no se combina con nada
  const candidates = [...new Set([...(COMPLEMENTS[interest.tag] ?? []), ...DISCOVERY_FALLBACK])].filter(
    (tag) => tag !== interest.tag && !NEVER_SUGGESTED.has(tag),
  )
  for (const tag of candidates) {
    const items = itemsFor(tag, 30).filter((item) => item.vertical !== interest.vertical)
    const vertical = mostCommon(items.map((item) => item.vertical))
    const inVertical = items.filter((item) => item.vertical === vertical)
    if (inVertical.length < MIN_DISCOVERY_ITEMS) continue
    return {
      ...describe(tag),
      vertical,
      verticalName: VERTICAL_NAMES[vertical] ?? vertical,
      items: inVertical.slice(0, 6),
    }
  }
  return null
}

export const PLANS = [
  {
    id: 'once',
    label: 'Once',
    emoji: '🫖',
    tags: ['dulce', 'fresco'],
    line: 'Once en casa: algo dulce y algo fresco.',
  },
  {
    id: 'carrete',
    label: 'Carrete',
    emoji: '🍻',
    tags: ['cerveza', 'licor', 'snack'],
    line: 'Para el carrete: de varias tiendas y llega todo.',
  },
  {
    id: 'asado',
    label: 'Asado',
    emoji: '🔥',
    tags: ['carne', 'cerveza', 'fresco'],
    line: '¡Asado! Carne, chelas y algo verde.',
  },
  {
    id: 'pelicula',
    label: 'Película',
    emoji: '🍿',
    tags: ['snack', 'pizza', 'dulce'],
    line: 'Noche de película: algo salado, pizza y postre.',
  },
  {
    id: 'regalo',
    label: 'Regalo',
    emoji: '🎁',
    tags: ['belleza', 'dulce'],
    line: 'Un regalo que no falla: perfume o chocolates.',
  },
]

const KIT_SIZE = 4

/** Hasta 4 ítems para el plan: de a uno por tema, buscando verticales distintas. */
export function planKit(planId) {
  const plan = PLANS.find((candidate) => candidate.id === planId)
  if (!plan) return []
  const pools = plan.tags.map((tag) => itemsFor(tag))
  const kit = []
  const usedVerticals = new Set()
  for (let round = 0; kit.length < KIT_SIZE && round < 3; round += 1) {
    for (const pool of pools) {
      if (kit.length >= KIT_SIZE) break
      const free = pool.filter((item) => !kit.some((chosen) => chosen.key === item.key))
      const pick = free.find((item) => !usedVerticals.has(item.vertical)) ?? (round > 0 ? free[0] : null)
      if (!pick) continue
      kit.push(pick)
      usedVerticals.add(pick.vertical)
    }
  }
  return kit
}
