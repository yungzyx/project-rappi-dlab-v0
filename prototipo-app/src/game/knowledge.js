// Tarjetas de conocimiento de cada vertical del pasaporte: datos «¿Sabías que…?» y preguntas, cada una con su fuente.
// Investigadas y verificadas contra la fuente (docs/resultados/juego-verificacion-2026-10-09.md).
import KNOWLEDGE from './knowledge.json'

export { KNOWLEDGE }

const byId = new Map(KNOWLEDGE.map((card) => [card.id, card]))

/** Las 12 tarjetas de una vertical, en el orden del archivo (6 datos y 6 preguntas). */
export const cardsOf = (vertical) => KNOWLEDGE.filter((card) => card.vertical === vertical)
export const datosOf = (vertical) => cardsOf(vertical).filter((card) => card.kind === 'dato')
export const preguntasOf = (vertical) => cardsOf(vertical).filter((card) => card.kind === 'pregunta')
export const cardById = (id) => byId.get(id)

/** Una pregunta con la forma de un desafío del catálogo (la que pinta la ronda), más su fuente. */
export function asChallenge(card) {
  return {
    id: card.id,
    kind: 'conocimiento',
    vertical: card.vertical,
    question: card.question,
    options: card.options.map((label, i) => ({ id: `${card.id}:${i}`, label })),
    answer: `${card.id}:${card.answer}`,
    explanation: card.explanation,
    source: card.source,
  }
}
