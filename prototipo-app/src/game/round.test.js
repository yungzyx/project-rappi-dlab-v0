import { describe, expect, test } from 'vitest'
import { gameCards, gameChallenge } from '../api/testing'
import { cardsOf, datosOf, preguntasOf, setKnowledge } from './knowledge.js'
import { initialState } from './progress.js'
import { ROUND_SIZE, makeRound, roundStars } from './round.js'
import { PASSPORT_ORDER } from './verticals.js'

/** El desafío que respondería la API para esta vertical con la semilla de hoy. */
const challengeFor = (state, vertical) => gameChallenge(vertical, String(state.answered[vertical] ?? 0))
const roundOf = (state, vertical) => makeRound(state, vertical, challengeFor(state, vertical))
const types = (round) => round.map((s) => s.type)
const ids = (round) => round.map((s) => s.card?.id ?? s.challenge.id)

describe('ronda', () => {
  test('trae 2 datos, 2 preguntas de conocimiento y 1 desafío del catálogo, sin repetir', () => {
    const round = roundOf(initialState(), 'chocolateria')
    expect(round).toHaveLength(ROUND_SIZE)
    expect(types(round)).toEqual(['dato', 'pregunta', 'dato', 'desafio', 'pregunta'])
    expect(new Set(ids(round)).size).toBe(ROUND_SIZE)
    expect(round[1].challenge.kind).toBe('conocimiento')
    expect(round[3].challenge.kind).not.toBe('conocimiento')
  })

  test('elige primero lo que todavía no se ha visto', () => {
    const [d1, d2, d3, d4] = datosOf('licores').map((c) => c.id)
    const [p1, , p3] = preguntasOf('licores').map((c) => c.id)
    const state = { ...initialState(), discovered: { licores: [d1, d2, p1] } }
    const round = roundOf(state, 'licores')
    expect([round[0].card.id, round[2].card.id]).toEqual([d3, d4])
    expect(round[1].challenge.id).not.toBe(p1)
    expect([round[1].challenge.id, round[4].challenge.id]).toContain(p3)
  })

  test('con todo visto, 3 rondas seguidas muestran los 6 datos y las 6 preguntas de la vertical', () => {
    for (const v of PASSPORT_ORDER) {
      const shown = new Set()
      for (const answered of [0, 3, 6]) {
        const state = { ...initialState(), discovered: { [v]: cardsOf(v).map((c) => c.id) }, answered: { [v]: answered } }
        for (const step of roundOf(state, v)) if (step.type !== 'desafio') shown.add(step.card?.id ?? step.challenge.id)
      }
      expect(shown.size, v).toBe(12)
    }
  })

  test('una pregunta fallada vuelve en la ronda siguiente con las alternativas en otro orden', () => {
    const first = roundOf(initialState(), 'supermercado')
    const missed = first[1].challenge
    const learned = first[4].challenge.id
    const datos = first.filter((s) => s.type === 'dato').map((s) => s.card.id)
    const state = { ...initialState(), discovered: { supermercado: [...datos, learned] }, answered: { supermercado: 3 } }
    const again = roundOf(state, 'supermercado').find((s) => s.challenge?.id === missed.id).challenge
    const labels = (ch) => ch.options.map((o) => o.label)
    const answerLabel = (ch) => ch.options.find((o) => o.id === ch.answer).label
    expect(labels(again)).not.toEqual(labels(missed))
    expect([...labels(again)].sort()).toEqual([...labels(missed)].sort())
    expect(answerLabel(again)).toBe(answerLabel(missed))
  })

  test('the middle step is the API challenge', () => {
    const challenge = gameChallenge('chocolateria', '0')
    const round = makeRound(initialState(), 'chocolateria', challenge)
    expect(round[3]).toEqual({ type: 'desafio', challenge })
  })

  test('the round uses the turn it is given, not the one in the state', () => {
    const state = { ...initialState(), discovered: { turbo: cardsOf('turbo').map((c) => c.id) } }
    const later = { ...state, answered: { turbo: 3 } }
    const challenge = gameChallenge('turbo', '0')
    expect(makeRound(state, 'turbo', challenge, 3)).toEqual(makeRound(later, 'turbo', challenge))
    expect(makeRound(state, 'turbo', challenge, 3)).not.toEqual(makeRound(state, 'turbo', challenge))
  })

  test('without a challenge the middle step is a third question', () => {
    const round = makeRound(initialState(), 'viajes', null)
    expect(types(round)).toEqual(['dato', 'pregunta', 'dato', 'pregunta', 'pregunta'])
    expect(round.filter((s) => s.type === 'pregunta').every((s) => s.challenge.kind === 'conocimiento')).toBe(true)
    // También en una vertical con catálogo, si la API no tiene desafío (204)
    expect(types(makeRound(initialState(), 'supermercado', null))).toEqual(types(round))
  })

  test('con todo visto, la ronda igual tiene 5 pasos sin repetir y es determinista', () => {
    for (const v of PASSPORT_ORDER) {
      for (const answered of [0, 3, 20]) {
        const state = { ...initialState(), discovered: { [v]: cardsOf(v).map((c) => c.id) }, answered: { [v]: answered } }
        const round = roundOf(state, v)
        expect(round, `${v} ${answered}`).toHaveLength(ROUND_SIZE)
        expect(new Set(ids(round)).size, `${v} ${answered}`).toBe(ROUND_SIZE)
        expect(roundOf(state, v)).toEqual(round)
      }
    }
  })

  test('a vertical without enough cards gives no round instead of steps without a card', () => {
    const cards = gameCards()
    try {
      setKnowledge(cards.filter((c) => c.vertical !== 'turbo'))
      expect(makeRound(initialState(), 'turbo', gameChallenge('turbo', '0'))).toBeNull()
      expect(makeRound(initialState(), 'turbo', null)).toBeNull()
      // Con un solo dato tampoco alcanza para los 2 de la ronda.
      const firstDato = cards.find((c) => c.vertical === 'turbo' && c.kind === 'dato')
      setKnowledge(cards.filter((c) => c.vertical !== 'turbo' || c.kind === 'pregunta' || c === firstDato))
      expect(makeRound(initialState(), 'turbo', gameChallenge('turbo', '0'))).toBeNull()
    } finally {
      setKnowledge(cards)
    }
  })

  test('las estrellas dependen de los aciertos', () => {
    expect(roundStars(3, 3)).toBe(3)
    expect(roundStars(2, 3)).toBe(2)
    expect(roundStars(1, 3)).toBe(1)
    expect(roundStars(0, 3)).toBe(0)
    expect(roundStars(5, 5)).toBe(3)
    expect(roundStars(4, 5)).toBe(2)
    expect(roundStars(2, 5)).toBe(1)
  })
})
