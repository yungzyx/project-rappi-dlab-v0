import DATA from '../data/verticales.json'

export { DATA }

const byId = new Map(DATA.concepts.map((c) => [c.id, c]))

export function conceptById(id) {
  return byId.get(id)
}

/** Un concepto pertenece a una vertical si tiene ahí al menos `minItems` productos (la regla de las líneas del 04). */
export function belongs(concept, vertical) {
  return (concept.items[vertical] ?? 0) >= DATA.minItems
}

const conceptsByVertical = Object.fromEntries(
  DATA.order.map((v) => [
    v,
    DATA.concepts.filter((c) => belongs(c, v)).sort((a, b) => b.items[v] - a.items[v] || a.id.localeCompare(b.id)),
  ]),
)

/** Conceptos del catálogo de una vertical (Viajes no tiene catálogo: ninguno). */
export function conceptsOf(vertical) {
  return conceptsByVertical[vertical] ?? []
}

const relations = new Map(
  DATA.concepts.map((c) => [c.id, { complements: new Set(), substitutes: new Set(), conflicts: new Set() }]),
)
const link = (kind, a, b) => {
  relations.get(a)[kind].add(b)
  relations.get(b)[kind].add(a)
}
for (const [a, b] of DATA.complements) link('complements', a, b)
for (const [a, b] of DATA.substitutes) link('substitutes', a, b)
for (const [a, b] of DATA.conflicts) link('conflicts', a, b)

/** Relaciones de un concepto, en ambos sentidos. */
export function related(id) {
  return relations.get(id)
}

const numberFormat = new Intl.NumberFormat('es-CL')

export function formatNumber(n) {
  return numberFormat.format(n)
}
