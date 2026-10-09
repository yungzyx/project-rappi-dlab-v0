import { describe, expect, test } from 'vitest'
import { DATA } from './data.js'
import { KINDS, kindsFor, makeChallenge } from './challenges.js'
import { rng } from './rng.js'

// Verificador independiente: lee las aristas crudas de DATA, sin pasar por `related`.
const pairIn = (edges, a, b) => edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
const anyEdge = (a, b) =>
  pairIn(DATA.complements, a, b) || pairIn(DATA.substitutes, a, b) || pairIn(DATA.conflicts, a, b)
const items = (id, v) => DATA.concepts.find((c) => c.id === id).items[v] ?? 0

function isTrue(ch, optionId) {
  const { kind, vertical: v, anchor } = ch
  switch (kind) {
    case 'tipico':
      return DATA.concepts.find((c) => c.id === optionId).home === v && items(optionId, v) >= DATA.minItems
    case 'combo':
      return pairIn(DATA.complements, anchor, optionId)
    case 'sustituto':
      return pairIn(DATA.substitutes, anchor, optionId)
    case 'imposible':
      return pairIn(DATA.conflicts, anchor, optionId)
    case 'puente':
      return !DATA.bridges.find(([name]) => name === anchor)[1].includes(optionId)
    case 'trivia': {
      const max = Math.max(...ch.options.map((o) => DATA.products[o.id]))
      return DATA.products[optionId] === max
    }
  }
  throw new Error(`tipo desconocido: ${kind}`)
}

// Los distractores además deben ser claramente falsos para el jugador.
function isClearlyFalse(ch, optionId) {
  const { kind, vertical: v, anchor } = ch
  if (kind === 'tipico') {
    const c = DATA.concepts.find((x) => x.id === optionId)
    return items(optionId, v) < DATA.minItems && c.home !== v
  }
  if (kind === 'combo' || kind === 'sustituto') return optionId !== anchor && !anyEdge(anchor, optionId)
  // Un concepto sin relación tampoco lo sugeriría Bigotes: los distractores deben ser complementos del ancla.
  if (kind === 'imposible')
    return pairIn(DATA.complements, anchor, optionId) && !pairIn(DATA.conflicts, anchor, optionId)
  return !isTrue(ch, optionId)
}

describe('rng', () => {
  test('misma semilla, misma secuencia; distinta semilla, otra', () => {
    const a = rng('2026-10-08')
    const b = rng('2026-10-08')
    const c = rng('2026-10-09')
    const seqA = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(seqA)
    expect([c(), c(), c()]).not.toEqual(seqA)
    for (const x of seqA) expect(x >= 0 && x < 1).toBe(true)
  })
})

describe('desafíos', () => {
  test('son deterministas por vertical y semilla', () => {
    expect(makeChallenge('licores', 'x-3')).toEqual(makeChallenge('licores', 'x-3'))
    const ids = new Set(Array.from({ length: 20 }, (_, i) => makeChallenge('supermercado', String(i)).id))
    expect(ids.size).toBeGreaterThanOrEqual(2)
  })

  test('kindsFor solo ofrece tipos con datos', () => {
    for (const v of DATA.order) {
      const kinds = kindsFor(v)
      expect(kinds.length).toBeGreaterThan(0)
      for (const k of kinds) expect(KINDS).toContain(k)
      if (v !== 'restaurantes') expect(kinds).toContain('trivia')
    }
    expect(kindsFor('restaurantes')).not.toContain('puente')
    // Restaurantes cuenta platos, no productos: no entra en la trivia de productos.
    expect(kindsFor('restaurantes')).not.toContain('trivia')
  })

  test('la trivia nunca compara Restaurantes (platos) con productos', () => {
    for (const v of DATA.order) {
      for (let s = 0; s < 200; s++) {
        const ch = makeChallenge(v, String(s))
        if (ch.kind === 'trivia') expect(ch.options.map((o) => o.id)).not.toContain('restaurantes')
      }
    }
  })

  test('producto puente pregunta dónde no se vende, con respuestas variadas', () => {
    const answers = new Set()
    for (const v of DATA.order) {
      for (let s = 0; s < 200; s++) {
        const ch = makeChallenge(v, String(s))
        if (ch.kind === 'puente') answers.add(ch.answer)
      }
    }
    expect(answers.size).toBeGreaterThanOrEqual(2)
  })

  test('el texto usa formas neutras y no habla de pedir', () => {
    for (const v of DATA.order) {
      for (let s = 0; s < 200; s++) {
        const ch = makeChallenge(v, String(s))
        expect(ch.question).not.toContain('lo reemplaza')
        expect(ch.explanation).not.toMatch(/pedido|junto a/)
      }
    }
  })

  test('cada tipo disponible se puede generar en cada vertical', () => {
    for (const v of DATA.order) {
      const seen = new Set()
      for (let s = 0; s < 200; s++) seen.add(makeChallenge(v, String(s)).kind)
      expect([...seen].sort()).toEqual([...kindsFor(v)].sort())
    }
  })

  test('exhaustivo: 1 correcta verdadera y 3 distractores falsos, sin repetir', () => {
    for (const v of DATA.order) {
      for (let s = 0; s < 200; s++) {
        const ch = makeChallenge(v, String(s))
        expect(ch.vertical).toBe(v)
        expect(ch.options).toHaveLength(4)
        expect(new Set(ch.options.map((o) => o.id)).size).toBe(4)
        expect(new Set(ch.options.map((o) => o.label)).size).toBe(4)
        expect(ch.options.map((o) => o.id)).toContain(ch.answer)
        for (const o of ch.options) {
          if (o.id === ch.answer) expect(isTrue(ch, o.id), `${ch.id} correcta ${o.id}`).toBe(true)
          else expect(isClearlyFalse(ch, o.id), `${ch.id} distractor ${o.id}`).toBe(true)
        }
        expect(ch.question.length).toBeGreaterThan(5)
        expect(ch.explanation.length).toBeGreaterThan(5)
      }
    }
  })

  test('en Restaurantes se habla de platos', () => {
    const ch = Array.from({ length: 200 }, (_, s) => makeChallenge('restaurantes', String(s))).find(
      (c) => c.kind === 'tipico',
    )
    expect(ch.explanation).toContain('platos')
  })

  test('ninguna pregunta ni explicación invita a comprar', () => {
    for (const v of DATA.order) {
      for (let s = 0; s < 100; s++) {
        const ch = makeChallenge(v, String(s))
        const text = [ch.question, ch.explanation, ...ch.options.map((o) => o.label)].join(' ')
        expect(text).not.toMatch(/compra|pide|agrega al carro/i)
      }
    }
  })
})
