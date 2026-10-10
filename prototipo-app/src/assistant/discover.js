// «Descubre con Mochi» (buscador con Mochi): cruza lo que le gusta a la persona con verticales que aún no
// abre. Todo sale del catálogo del prototipo; un ítem es un producto o una tienda.
import { VERTICAL_NAMES } from '../data/verticals'
import { COMPLEMENTS, NEVER_SUGGESTED, TAGS, productsForTags, storesForTags } from './tags'

// Sin perfil todavía: temas que funcionan con casi todos, para que la primera visita también invite a explorar.
const STARTERS = ['pizza', 'cerveza', 'dulce']
// Un restaurante solo se sugiere para comida preparada: «cerveza en Restaurantes» no invita a nada.
const PREPARED = new Set(['pizza', 'hamburguesa', 'pollo', 'sushi'])
const MAX_CARDS = 3
const ITEMS_PER_CARD = 3
const MIN_ITEMS = 2

const asProduct = (product) => ({ kind: 'product', key: `p-${product.id}`, vertical: product.vertical, product })
const asStore = (store) => ({ kind: 'store', key: `s-${store.name}`, vertical: store.vertical, store })

function itemsFor(tag) {
  return [...productsForTags([tag], 30).map(asProduct), ...storesForTags([tag], 12).map(asStore)].filter(
    (item) => item.vertical && (item.vertical !== 'restaurants' || PREPARED.has(tag)),
  )
}

const describe = (tag) => ({ tag, label: TAGS[tag].label, emoji: TAGS[tag].emoji })

/**
 * Hasta 3 tarjetas, cada una de una vertical distinta que la persona todavía no abre: «Te gusta 🍺 Cerveza →
 * 🍿 Snacks en Express». `top`: sus temas favoritos (el perfil); `explored`: las verticales que ya abrió.
 */
export function discoveries(top, explored = []) {
  const interests = top.filter((tag) => TAGS[tag] && !NEVER_SUGGESTED.has(tag))
  const personal = interests.length > 0
  const sources = personal ? interests : STARTERS
  const taken = new Set(explored)
  const cards = []

  for (const from of sources) {
    // Primero sus complementos; sin perfil, el tema mismo en una vertical nueva también sirve.
    const targets = [...(COMPLEMENTS[from] ?? []), ...(personal ? [] : [from])].filter(
      (tag) => !NEVER_SUGGESTED.has(tag),
    )
    for (const to of targets) {
      if (cards.length >= MAX_CARDS) return cards
      const byVertical = Map.groupBy(
        itemsFor(to).filter((item) => !taken.has(item.vertical)),
        (item) => item.vertical,
      )
      const [vertical, items] = [...byVertical.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? []
      if (!vertical || items.length < MIN_ITEMS) continue
      taken.add(vertical)
      cards.push({
        vertical,
        verticalName: VERTICAL_NAMES[vertical] ?? vertical,
        from: personal ? describe(from) : null,
        to: describe(to),
        items: items.slice(0, ITEMS_PER_CARD),
      })
    }
  }
  return cards
}
