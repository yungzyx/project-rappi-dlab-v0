import { DATA, belongs, conceptById, conceptsOf, formatNumber, related } from './data.js'
import { pickOne, rng, sample, shuffle } from './rng.js'

export const KINDS = ['tipico', 'combo', 'sustituto', 'imposible', 'puente', 'trivia']

const label = (v) => DATA.labels[v]
const unit = (v) => (v === 'restaurantes' ? 'platos' : 'productos')
const name = (c) => `${c.emoji} ${c.name}`
const option = (c) => ({ id: c.id, label: name(c) })
const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`)

/** Conceptos sin ninguna relación con el ancla (ni el ancla misma): distractores seguros. */
function unrelatedTo(id) {
  const r = related(id)
  return DATA.concepts.filter(
    (c) => c.id !== id && !r.complements.has(c.id) && !r.substitutes.has(c.id) && !r.conflicts.has(c.id),
  )
}

const typicalOf = (v) => conceptsOf(v).filter((c) => c.home === v)
const notIn = (v) => DATA.concepts.filter((c) => !belongs(c, v))
const withRelation = (v, kind) => conceptsOf(v).filter((c) => related(c.id)[kind].size > 0)
const bridgesOf = (v) => DATA.bridges.filter(([, vs]) => vs.includes(v))

const GENERATORS = {
  tipico: {
    available: (v) => typicalOf(v).length > 0 && notIn(v).length >= 3,
    make(v, r) {
      const correct = pickOne(r, typicalOf(v))
      return {
        anchor: correct.id,
        question: `¿Cuál de estos es típico de ${label(v)}?`,
        correct: option(correct),
        distractors: sample(r, notIn(v), 3).map(option),
        explanation: `Bigotes asocia ${name(correct)} con ${label(v)}, donde tiene ${formatNumber(correct.items[v])} ${unit(v)}. Las otras opciones tienen menos de ${DATA.minItems} ahí.`,
      }
    },
  },
  combo: {
    available: (v) => withRelation(v, 'complements').length > 0,
    make(v, r) {
      const anchor = pickOne(r, withRelation(v, 'complements'))
      const correct = conceptById(pickOne(r, [...related(anchor.id).complements].sort()))
      const elsewhere = correct.home !== v ? ` Lo encuentras sobre todo en ${label(correct.home)}.` : ''
      return {
        anchor: anchor.id,
        question: `¿Qué combina con ${name(anchor)}?`,
        correct: option(correct),
        distractors: sample(r, unrelatedTo(anchor.id), 3).map(option),
        explanation: `Bigotes sugiere ${name(correct)} junto a ${name(anchor)}.${elsewhere}`,
      }
    },
  },
  sustituto: {
    available: (v) => withRelation(v, 'substitutes').length > 0,
    make(v, r) {
      const anchor = pickOne(r, withRelation(v, 'substitutes'))
      const correct = conceptById(pickOne(r, [...related(anchor.id).substitutes].sort()))
      return {
        anchor: anchor.id,
        question: `Si no hay ${name(anchor)}, ¿qué lo reemplaza?`,
        correct: option(correct),
        distractors: sample(r, unrelatedTo(anchor.id), 3).map(option),
        explanation: `Cuando no hay ${name(anchor)}, Bigotes ofrece ${name(correct)} en su lugar.`,
      }
    },
  },
  imposible: {
    available: (v) => withRelation(v, 'conflicts').length > 0,
    make(v, r) {
      const anchor = pickOne(r, withRelation(v, 'conflicts'))
      const rel = related(anchor.id)
      const correct = conceptById(pickOne(r, [...rel.conflicts].sort()))
      // Complementos del ancla primero (son lo contrario de una pareja imposible); si faltan, conceptos sin relación.
      const complements = shuffle(r, [...rel.complements].filter((id) => !rel.conflicts.has(id)).sort())
      const fill = sample(r, unrelatedTo(anchor.id), 3).map((c) => c.id)
      const distractors = [...new Set([...complements, ...fill])].slice(0, 3).map(conceptById)
      return {
        anchor: anchor.id,
        question: `¿Cuál nunca sugeriría Bigotes junto a ${name(anchor)}?`,
        correct: option(correct),
        distractors: distractors.map(option),
        explanation: `Bigotes nunca sugiere ${name(correct)} junto a ${name(anchor)}: no van en el mismo pedido.`,
      }
    },
  },
  puente: {
    available: (v) => bridgesOf(v).length > 0,
    make(v, r) {
      const [product, verticals] = pickOne(r, bridgesOf(v))
      const n = verticals.length
      const others = sample(
        r,
        [1, 2, 3, 4, 5, 6, 7, 8].filter((k) => k !== n),
        3,
      )
      const asOption = (k) => ({ id: String(k), label: k === 1 ? '1 vertical' : `${k} verticales` })
      return {
        anchor: product,
        question: `¿En cuántas verticales se vende ${product}?`,
        correct: asOption(n),
        distractors: others.map(asOption),
        explanation: `${product} se vende en ${n} verticales: ${list(verticals.map(label))}.`,
      }
    },
  },
  trivia: {
    available: () => true,
    make(v, r) {
      const picked = [
        v,
        ...sample(
          r,
          DATA.order.filter((x) => x !== v),
          3,
        ),
      ]
      const top = picked.reduce((best, x) => (DATA.products[x] > DATA.products[best] ? x : best))
      const asOption = (x) => ({ id: x, label: label(x) })
      const counts = picked
        .map((x) => `${label(x)}: ${formatNumber(DATA.products[x])}${x === 'restaurantes' ? ' platos' : ''}`)
        .join(' · ')
      return {
        anchor: null,
        question: '¿Cuál de estas verticales tiene más productos?',
        correct: asOption(top),
        distractors: picked.filter((x) => x !== top).map(asOption),
        explanation: counts,
      }
    },
  },
}

/** Tipos de desafío que tienen datos en esta vertical. */
export function kindsFor(vertical) {
  return KINDS.filter((k) => GENERATORS[k].available(vertical))
}

/** Desafío de 4 opciones para una vertical: la misma semilla da el mismo desafío. */
export function makeChallenge(vertical, seed) {
  const r = rng(`${vertical}|${seed}`)
  const kind = pickOne(r, kindsFor(vertical))
  const made = GENERATORS[kind].make(vertical, r)
  return {
    id: `${vertical}:${kind}:${made.anchor ?? '-'}:${seed}`,
    kind,
    vertical,
    anchor: made.anchor,
    question: made.question,
    options: shuffle(r, [made.correct, ...made.distractors]),
    answer: made.correct.id,
    explanation: made.explanation,
  }
}
