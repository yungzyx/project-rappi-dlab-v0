import { makeChallenge } from './challenges.js'
import { DATA } from './data.js'
import { asChallenge, datosOf, preguntasOf } from './knowledge.js'

export const ROUND_SIZE = 5

/**
 * Las n tarjetas que tocan: primero las que no se han visto (en el orden del archivo) y, si faltan, las ya vistas, que
 * van rotando según cuántas preguntas lleva respondidas la vertical (así una ronda repetida no es siempre igual).
 */
function pick(cards, seen, n, turn) {
  const fresh = cards.filter((card) => !seen.has(card.id))
  const old = cards.filter((card) => seen.has(card.id))
  const start = old.length ? turn % old.length : 0
  return [...fresh, ...old.slice(start), ...old.slice(0, start)].slice(0, n)
}

/**
 * Una ronda en una vertical: 2 datos «¿Sabías que…?», 2 preguntas de conocimiento y 1 desafío del catálogo (la
 * pregunta del día de challenges.js), intercalados. Viajes no tiene catálogo: cambia el desafío por otra pregunta.
 */
export function makeRound(state, vertical) {
  const seen = new Set(state.discovered[vertical] ?? [])
  const turn = state.answered[vertical] ?? 0
  const hasCatalog = DATA.order.includes(vertical)
  const [d1, d2] = pick(datosOf(vertical), seen, 2, turn)
  const [p1, p2, p3] = pick(preguntasOf(vertical), seen, hasCatalog ? 2 : 3, turn)
  const middle = hasCatalog
    ? { type: 'desafio', challenge: makeChallenge(vertical, String(turn)) }
    : { type: 'pregunta', challenge: asChallenge(p3) }
  return [
    { type: 'dato', card: d1 },
    { type: 'pregunta', challenge: asChallenge(p1) },
    { type: 'dato', card: d2 },
    middle,
    { type: 'pregunta', challenge: asChallenge(p2) },
  ]
}

/** 3 estrellas sin errores, 2 con 60 % o más de aciertos, 1 con al menos un acierto. */
export function roundStars(correct, total) {
  if (total > 0 && correct === total) return 3
  if (total > 0 && correct / total >= 0.6) return 2
  return correct > 0 ? 1 : 0
}
