import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { fixture } from '../api/testing'
import { KNOWLEDGE, asChallenge, cardById, cardsOf, datosOf, preguntasOf, setKnowledge } from './knowledge.js'

// Las tarjetas las valida el backend (pytest); aquí solo se prueba cómo las usa la app, con la respuesta de ejemplo de la API.
const API_CARDS = fixture('game-cards').cards
let before

beforeEach(() => {
  before = [...KNOWLEDGE]
  setKnowledge(API_CARDS)
})
afterEach(() => setKnowledge(before))

describe('registro de tarjetas', () => {
  test('setKnowledge reemplaza lo que había y las consultas lo reflejan', () => {
    expect(KNOWLEDGE).toHaveLength(API_CARDS.length)
    expect(cardsOf('supermercado')).toHaveLength(12)
    expect(datosOf('supermercado')).toHaveLength(6)
    expect(preguntasOf('supermercado')).toHaveLength(6)
    expect(cardsOf('licores')).toEqual([])
    expect(cardById(API_CARDS[0].id)).toBe(KNOWLEDGE[0])
    setKnowledge([])
    expect(KNOWLEDGE).toHaveLength(0)
    expect(cardById(API_CARDS[0].id)).toBeUndefined()
  })
})

describe('asChallenge', () => {
  const card = () => preguntasOf('supermercado')[0]

  test('da la forma de un desafío', () => {
    const challenge = asChallenge(card())
    expect(challenge).toMatchObject({ id: card().id, kind: 'conocimiento', vertical: 'supermercado', question: card().question })
    expect(challenge.options.map((o) => o.label)).toEqual(card().options)
    expect(challenge.options.find((o) => o.id === challenge.answer).label).toBe(card().options[card().answer])
    expect(challenge.source).toEqual(card().source)
  })

  test('rotar las alternativas no cambia cuál es la respuesta', () => {
    for (const shift of [1, 2, 5]) {
      const challenge = asChallenge(card(), shift)
      expect(challenge.options.map((o) => o.label).sort()).toEqual([...card().options].sort())
      expect(challenge.options.find((o) => o.id === challenge.answer).label).toBe(card().options[card().answer])
    }
  })
})
