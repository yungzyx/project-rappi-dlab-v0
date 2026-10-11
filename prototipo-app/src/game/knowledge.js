// Tarjetas de conocimiento de cada vertical del pasaporte: datos «¿Sabías que…?» y preguntas, cada una con su fuente.
// Las sirve la API (GET /game/cards); GameProvider las carga con setKnowledge antes de pintar el juego.

/** El registro de tarjetas. Es un solo arreglo que se llena en el lugar, así quien lo importó ve siempre lo cargado. */
export const KNOWLEDGE = []
const byId = new Map()

/** Reemplaza el registro con las tarjetas que dio la API. */
export function setKnowledge(cards) {
  KNOWLEDGE.splice(0, KNOWLEDGE.length, ...cards)
  byId.clear()
  for (const card of KNOWLEDGE) byId.set(card.id, card)
}

/** Las tarjetas de una vertical, en el orden de la API (12: 6 datos y 6 preguntas). */
export const cardsOf = (vertical) => KNOWLEDGE.filter((card) => card.vertical === vertical)
export const datosOf = (vertical) => cardsOf(vertical).filter((card) => card.kind === 'dato')
export const preguntasOf = (vertical) => cardsOf(vertical).filter((card) => card.kind === 'pregunta')
export const cardById = (id) => byId.get(id)

/**
 * Una pregunta con la forma de un desafío del catálogo (la que pinta la ronda), más su fuente. `shift` rota el orden de
 * las alternativas; los ids siguen siendo los de la tarjeta, así que la respuesta no cambia.
 */
export function asChallenge(card, shift = 0) {
  const options = card.options.map((label, i) => ({ id: `${card.id}:${i}`, label }))
  const k = shift % options.length
  return {
    id: card.id,
    kind: 'conocimiento',
    vertical: card.vertical,
    question: card.question,
    options: [...options.slice(k), ...options.slice(0, k)],
    answer: `${card.id}:${card.answer}`,
    explanation: card.explanation,
    source: card.source,
  }
}
