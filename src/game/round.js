import { makeChallenge } from './challenges.js'
import { conceptsOf } from './data.js'

export const ROUND_SIZE = 5
const MAX_DISCOVERIES = 2
const MAX_TRIES = 30

/**
 * Una ronda de juego en una vertical: hasta 2 conceptos nuevos (los de más productos primero) intercalados con
 * desafíos. Los desafíos siguen la semilla de cuántos lleva la vertical, sin repetir una pregunta en la ronda.
 */
export function makeRound(state, vertical) {
  const seen = new Set(state.discovered[vertical] ?? [])
  const fresh = conceptsOf(vertical)
    .filter((c) => !seen.has(c.id))
    .slice(0, MAX_DISCOVERIES)

  const base = state.answered[vertical] ?? 0
  const questions = new Set()
  const challenges = []
  for (let seed = base; challenges.length < ROUND_SIZE - fresh.length && seed < base + MAX_TRIES; seed++) {
    const challenge = makeChallenge(vertical, String(seed))
    const key = challenge.question + challenge.answer
    if (questions.has(key)) continue
    questions.add(key)
    challenges.push(challenge)
  }

  // Descubrir, desafío, descubrir, desafío...: así la ronda empieza fácil y alterna.
  const steps = []
  const pending = [...fresh]
  for (const challenge of challenges) {
    if (pending.length) steps.push({ type: 'descubrir', concept: pending.shift() })
    steps.push({ type: 'desafio', challenge })
  }
  return [...steps, ...pending.map((concept) => ({ type: 'descubrir', concept }))]
}

/** 3 estrellas sin errores, 2 con 60 % o más de aciertos, 1 con al menos un acierto. */
export function roundStars(correct, total) {
  if (total > 0 && correct === total) return 3
  if (total > 0 && correct / total >= 0.6) return 2
  return correct > 0 ? 1 : 0
}
