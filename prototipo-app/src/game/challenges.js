import { AGENT_NAME } from '../agent/name.js'
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
// Distractores de «típico»: ni pertenecen a la vertical ni la tienen como típica.
const notIn = (v) => DATA.concepts.filter((c) => !belongs(c, v) && c.home !== v)
const withRelation = (v, kind) => conceptsOf(v).filter((c) => related(c.id)[kind].size > 0)
const bridgesOf = (v) => DATA.bridges.filter(([, vs]) => vs.includes(v))
// Complementos que no son pareja imposible: los únicos distractores seguros de «pareja imposible»
// (un concepto sin relación tampoco lo sugeriría el agente, así que también sería correcto).
const safeComplements = (id) => [...related(id).complements].filter((x) => !related(id).conflicts.has(x)).sort()
const TRIVIA_POOL = DATA.order.filter((v) => v !== 'restaurantes') // Restaurantes cuenta platos, no productos

const imposibleAnchors = (v) => withRelation(v, 'conflicts').filter((c) => safeComplements(c.id).length >= 3)

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
        explanation: `${AGENT_NAME} asocia ${name(correct)} con ${label(v)}, donde tiene ${formatNumber(correct.items[v])} ${unit(v)}. Las otras opciones tienen menos de ${DATA.minItems} ahí.`,
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
        explanation: `${AGENT_NAME} sugiere ${name(anchor)} y ${name(correct)} juntos.${elsewhere}`,
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
        question: `Si no hay ${name(anchor)}, ¿qué ofrece ${AGENT_NAME} en su lugar?`,
        correct: option(correct),
        distractors: sample(r, unrelatedTo(anchor.id), 3).map(option),
        explanation: `Cuando no hay ${name(anchor)}, ${AGENT_NAME} ofrece ${name(correct)} en su lugar.`,
      }
    },
  },
  imposible: {
    available: (v) => imposibleAnchors(v).length > 0,
    make(v, r) {
      const anchor = pickOne(r, imposibleAnchors(v))
      const correct = conceptById(pickOne(r, [...related(anchor.id).conflicts].sort()))
      return {
        anchor: anchor.id,
        question: `¿Cuál nunca sugeriría ${AGENT_NAME} junto a ${name(anchor)}?`,
        correct: option(correct),
        distractors: sample(r, safeComplements(anchor.id), 3).map(conceptById).map(option),
        explanation: `${AGENT_NAME} nunca sugiere ${name(anchor)} y ${name(correct)} juntos. Las otras opciones sí las sugiere con ${name(anchor)}.`,
      }
    },
  },
  puente: {
    available: (v) => bridgesOf(v).length > 0,
    make(v, r) {
      const [product, verticals] = pickOne(r, bridgesOf(v))
      const asOption = (x) => ({ id: x, label: label(x) })
      // Restaurantes queda fuera: que un energizante no se venda en un restaurante es obvio, no un dato.
      const pool = verticals.filter((x) => x !== 'restaurantes')
      const missing = DATA.order.filter((x) => x !== 'restaurantes' && !verticals.includes(x))
      return {
        anchor: product,
        question: `${product} está en ${pool.length} verticales de productos. ¿En cuál de estas no está?`,
        correct: asOption(pickOne(r, missing)),
        distractors: sample(r, pool, 3).map(asOption),
        explanation: `${product} está en ${list(verticals.map(label))}.`,
      }
    },
  },
  trivia: {
    available: (v) => TRIVIA_POOL.includes(v),
    make(v, r) {
      const picked = [
        v,
        ...sample(
          r,
          TRIVIA_POOL.filter((x) => x !== v),
          3,
        ),
      ]
      const top = picked.reduce((best, x) => (DATA.products[x] > DATA.products[best] ? x : best))
      const asOption = (x) => ({ id: x, label: label(x) })
      const counts = picked.map((x) => `${label(x)}: ${formatNumber(DATA.products[x])}`).join(' · ')
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
