// Cuando el buscador no encuentra nada: si la consulta es de un tema conocido («chela» → cerveza), la vertical donde
// más hay de eso, para que Mochi lleve ahí en vez de dejar un «sin resultados».
import { VERTICAL_NAMES } from '../data/verticals'
import { NEVER_SUGGESTED, TAGS, mostCommon, productsForTags, storesForTags, tagsOf } from './tags'

/** `{ tag, label, emoji, vertical, verticalName }` o null (sin tema, tema sensible o sin vertical que lo tenga). */
export function emptySearch(query) {
  const tag = tagsOf(query).find((candidate) => TAGS[candidate] && !NEVER_SUGGESTED.has(candidate))
  if (!tag) return null
  const verticals = [...productsForTags([tag], 30), ...storesForTags([tag], 12)]
    .map((item) => item.vertical)
    .filter((vertical) => vertical && !NEVER_SUGGESTED.has(vertical))
  const vertical = mostCommon(verticals)
  if (!vertical) return null
  return { tag, label: TAGS[tag].label, emoji: TAGS[tag].emoji, vertical, verticalName: VERTICAL_NAMES[vertical] ?? vertical }
}
