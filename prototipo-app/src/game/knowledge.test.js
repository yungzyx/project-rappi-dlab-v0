import { describe, expect, test } from 'vitest'
import { KNOWLEDGE, asChallenge, cardById, cardsOf, datosOf, preguntasOf } from './knowledge.js'
import { PASSPORT_ORDER } from './verticals.js'

const LIMITS = { title: 40, text: 200, question: 140, option: 60, explanation: 200 }

describe('tarjetas de conocimiento', () => {
  test('cada vertical del pasaporte tiene 6 datos y 6 preguntas', () => {
    for (const vertical of PASSPORT_ORDER) {
      expect(datosOf(vertical), vertical).toHaveLength(6)
      expect(preguntasOf(vertical), vertical).toHaveLength(6)
      expect(cardsOf(vertical), vertical).toHaveLength(12)
    }
    expect(KNOWLEDGE).toHaveLength(108)
  })

  test('cada tarjeta respeta los largos y tiene fuente https', () => {
    for (const card of KNOWLEDGE) {
      expect(card.source.title, card.id).toBeTruthy()
      expect(card.source.url, card.id).toMatch(/^https:\/\//)
      if (card.kind === 'dato') {
        expect(card.title.length, card.id).toBeLessThanOrEqual(LIMITS.title)
        expect(card.text.length, card.id).toBeLessThanOrEqual(LIMITS.text)
      } else {
        expect(card.question.length, card.id).toBeLessThanOrEqual(LIMITS.question)
        expect(card.explanation.length, card.id).toBeLessThanOrEqual(LIMITS.explanation)
        card.options.forEach((option) => expect(option.length, card.id).toBeLessThanOrEqual(LIMITS.option))
      }
    }
  })

  test('en cada pregunta la respuesta está entre 3 alternativas distintas', () => {
    for (const card of KNOWLEDGE.filter((c) => c.kind === 'pregunta')) {
      expect(card.options, card.id).toHaveLength(3)
      expect(new Set(card.options).size, card.id).toBe(3)
      expect([0, 1, 2], card.id).toContain(card.answer)
    }
  })

  test('la respuesta correcta no está siempre en el mismo lugar dentro de una vertical', () => {
    for (const vertical of PASSPORT_ORDER) {
      expect(new Set(preguntasOf(vertical).map((c) => c.answer)).size, vertical).toBeGreaterThan(1)
    }
  })

  test('ids únicos y con el prefijo de su vertical', () => {
    expect(new Set(KNOWLEDGE.map((c) => c.id)).size).toBe(KNOWLEDGE.length)
    for (const card of KNOWLEDGE) expect(card.id.startsWith(`${card.vertical}-`), card.id).toBe(true)
    expect(cardById(KNOWLEDGE[0].id)).toBe(KNOWLEDGE[0])
  })

  test('asChallenge da la forma de un desafío', () => {
    const card = preguntasOf('chocolateria')[0]
    const challenge = asChallenge(card)
    expect(challenge).toMatchObject({ id: card.id, kind: 'conocimiento', vertical: 'chocolateria', question: card.question })
    expect(challenge.options.map((o) => o.label)).toEqual(card.options)
    expect(challenge.options.find((o) => o.id === challenge.answer).label).toBe(card.options[card.answer])
    expect(challenge.source).toEqual(card.source)
  })
})
