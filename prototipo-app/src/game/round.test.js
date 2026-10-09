import { describe, expect, test } from 'vitest'
import { DATA, conceptsOf } from './data.js'
import { initialState } from './progress.js'
import { ROUND_SIZE, makeRound, roundStars } from './round.js'

const kinds = (round) => round.map((s) => s.type)

describe('ronda', () => {
  test('con conceptos por descubrir mezcla 2 descubrimientos y 3 desafíos', () => {
    const round = makeRound(initialState(), 'supermercado')
    expect(round).toHaveLength(ROUND_SIZE)
    expect(kinds(round)).toEqual(['descubrir', 'desafio', 'descubrir', 'desafio', 'desafio'])
    const [first, second] = conceptsOf('supermercado')
    expect(round[0].concept.id).toBe(first.id)
    expect(round[2].concept.id).toBe(second.id)
  })

  test('descubre los que faltan, en orden', () => {
    const v = 'chocolateria'
    const all = conceptsOf(v).map((c) => c.id)
    const state = { ...initialState(), discovered: { [v]: all.slice(0, all.length - 1) } }
    const round = makeRound(state, v)
    expect(kinds(round)).toEqual(['descubrir', 'desafio', 'desafio', 'desafio', 'desafio'])
    expect(round[0].concept.id).toBe(all.at(-1))
  })

  test('con todo descubierto son 5 desafíos', () => {
    const v = 'chocolateria'
    const state = { ...initialState(), discovered: { [v]: conceptsOf(v).map((c) => c.id) } }
    expect(kinds(makeRound(state, v))).toEqual(Array(ROUND_SIZE).fill('desafio'))
  })

  test('no repite una pregunta dentro de la ronda y es determinista', () => {
    for (const v of DATA.order) {
      for (const answered of [0, 3, 7, 20]) {
        const state = {
          ...initialState(),
          discovered: { [v]: conceptsOf(v).map((c) => c.id) },
          answered: { [v]: answered },
        }
        const round = makeRound(state, v)
        const questions = round.map((s) => s.challenge.question + s.challenge.answer)
        expect(new Set(questions).size, `${v} ${answered}`).toBe(questions.length)
        expect(makeRound(state, v)).toEqual(round)
      }
    }
  })

  test('toda ronda tiene al menos un desafío', () => {
    for (const v of DATA.order) {
      const state = { ...initialState(), discovered: { [v]: conceptsOf(v).map((c) => c.id) }, answered: { [v]: 500 } }
      expect(makeRound(state, v).filter((s) => s.type === 'desafio').length).toBeGreaterThanOrEqual(1)
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
