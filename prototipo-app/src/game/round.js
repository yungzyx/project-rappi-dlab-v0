import { asChallenge, datosOf, preguntasOf } from './knowledge.js'

export const ROUND_SIZE = 5

/**
 * Las n tarjetas que tocan: primero las que no se han visto (en el orden del archivo) y, si faltan, las ya vistas, que
 * avanzan n lugares por ronda (así las rondas repetidas pasan por todas, no siempre por las mismas).
 */
function pick(cards, seen, n, round) {
  const fresh = cards.filter((card) => !seen.has(card.id))
  const old = cards.filter((card) => seen.has(card.id))
  const start = old.length ? (round * n) % old.length : 0
  return [...fresh, ...old.slice(start), ...old.slice(0, start)].slice(0, n)
}

/**
 * Una ronda en una vertical: 2 datos «¿Sabías que…?», 2 preguntas de conocimiento y 1 desafío del catálogo (el que
 * pide la API, `challenge`), intercalados. `turn`: las respuestas de la vertical con que se pidió el desafío (la semilla). Sin desafío (`null`: Viajes no tiene catálogo) cambia el desafío por otra pregunta.
 */
export function makeRound(state, vertical, challenge, turn = state.answered[vertical] ?? 0) {
  const seen = new Set(state.discovered[vertical] ?? [])
  // Cada ronda completa responde 3 preguntas (2 y el desafío; sin desafío, 3 preguntas).
  const round = Math.floor(turn / 3)
  const hasChallenge = Boolean(challenge)
  const [d1, d2] = pick(datosOf(vertical), seen, 2, round)
  const [p1, p2, p3] = pick(preguntasOf(vertical), seen, hasChallenge ? 2 : 3, round)
  // Las alternativas rotan con la ronda: una pregunta fallada no vuelve con el mismo orden.
  const ask = (card) => asChallenge(card, round)
  const middle = hasChallenge
    ? { type: 'desafio', challenge }
    : { type: 'pregunta', challenge: ask(p3) }
  return [
    { type: 'dato', card: d1 },
    { type: 'pregunta', challenge: ask(p1) },
    { type: 'dato', card: d2 },
    middle,
    { type: 'pregunta', challenge: ask(p2) },
  ]
}

/** 3 estrellas sin errores, 2 con 60 % o más de aciertos, 1 con al menos un acierto. */
export function roundStars(correct, total) {
  if (total > 0 && correct === total) return 3
  if (total > 0 && correct / total >= 0.6) return 2
  return correct > 0 ? 1 : 0
}
