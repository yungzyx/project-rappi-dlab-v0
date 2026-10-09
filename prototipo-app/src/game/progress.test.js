import { describe, expect, test } from 'vitest'
import { DATA, conceptsOf } from './data.js'
import { FACTS, factsOf } from './facts.js'
import {
  answer,
  conoceRappi,
  currentStreak,
  dailyProgress,
  discover,
  explorerLevel,
  initialState,
  levelsGained,
  markIntroSeen,
  nextVertical,
  openCard,
  today,
  verticalLevel,
} from './progress.js'

const D = '2026-10-08'

function deepFreeze(o) {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze)
    Object.freeze(o)
  }
  return o
}

/** Descubre los primeros n conceptos de una vertical y acierta/erra desafíos. */
function play(state, v, { discovered = 0, correct = 0, date = D } = {}) {
  let s = state
  for (const c of conceptsOf(v).slice(0, discovered)) s = discover(s, v, c.id, date).state
  for (let i = 0; i < correct; i++) s = answer(s, v, true, date).state
  return s
}

/** Completa la misión del día en una fecha. */
function completeDay(state, date) {
  let s = state
  const v = 'supermercado'
  const fresh = conceptsOf(v).filter((c) => !(s.discovered[v] ?? []).includes(c.id))
  s = discover(s, v, fresh[0].id, date).state
  s = discover(s, v, fresh[1].id, date).state
  const res = answer(s, v, true, date)
  s = openCard(res.state, res.card?.id ?? s.cards[0], date).state
  return s
}

describe('experiencia', () => {
  test('descubrir da 10 una sola vez por concepto y vertical', () => {
    const id = conceptsOf('turbo')[0].id
    const first = discover(initialState(), 'turbo', id, D)
    expect(first.xp).toBe(10)
    expect(first.state.xp).toBe(10)
    const again = discover(first.state, 'turbo', id, D)
    expect(again.xp).toBe(0)
    expect(again.state.xp).toBe(10)
    expect(discover(first.state, 'supermercado', id, D).xp).toBe(10)
  })

  test('acertar da 20 y errar 5', () => {
    expect(answer(initialState(), 'licores', true, D).xp).toBe(20)
    expect(answer(initialState(), 'licores', false, D).xp).toBe(5)
    const s = answer(answer(initialState(), 'licores', true, D).state, 'licores', false, D).state
    expect(s.correct.licores).toBe(1)
    expect(s.answered.licores).toBe(2)
  })

  test('la misión del día completa suma 50 una sola vez', () => {
    const s = completeDay(initialState(), D)
    expect(dailyProgress(s, D).done).toBe(true)
    expect(s.xp).toBe(10 + 10 + 20 + 50)
    const more = answer(s, 'supermercado', true, D)
    expect(more.xp).toBe(20)
    expect(more.state.xp).toBe(s.xp + 20)
  })

  test('nivel de explorador sube cada 100 XP', () => {
    expect(explorerLevel(0)).toBe(1)
    expect(explorerLevel(99)).toBe(1)
    expect(explorerLevel(100)).toBe(2)
    expect(explorerLevel(199)).toBe(2)
  })
})

describe('nivel de explorador', () => {
  test('levelsGained lista los niveles nuevos al sumar XP', () => {
    expect(levelsGained(90, 110)).toEqual([2])
    expect(levelsGained(90, 99)).toEqual([])
    expect(levelsGained(180, 420)).toEqual([3, 4, 5])
  })

  test('la bienvenida se marca vista sin mutar el estado', () => {
    const s = deepFreeze(initialState())
    expect(s.seenIntro).toBe(false)
    expect(markIntroSeen(s).seenIntro).toBe(true)
  })
})

describe('niveles de vertical', () => {
  test('Chocolatería (9 conceptos) sigue los umbrales', () => {
    expect(conceptsOf('chocolateria')).toHaveLength(9)
    const s0 = initialState()
    expect(verticalLevel(s0, 'chocolateria')).toBe('ninguno')
    expect(verticalLevel(play(s0, 'chocolateria', { discovered: 1 }), 'chocolateria')).toBe('explorador')
    expect(verticalLevel(play(s0, 'chocolateria', { discovered: 5, correct: 2 }), 'chocolateria')).toBe('explorador')
    expect(verticalLevel(play(s0, 'chocolateria', { discovered: 4, correct: 3 }), 'chocolateria')).toBe('explorador')
    expect(verticalLevel(play(s0, 'chocolateria', { discovered: 5, correct: 3 }), 'chocolateria')).toBe('conocedor')
    expect(verticalLevel(play(s0, 'chocolateria', { discovered: 9, correct: 7 }), 'chocolateria')).toBe('conocedor')
    expect(verticalLevel(play(s0, 'chocolateria', { discovered: 9, correct: 8 }), 'chocolateria')).toBe('experto')
  })

  test('Conoce Rappi exige las 8 en Conocedor o más', () => {
    let s = initialState()
    const [last, ...rest] = [...DATA.order].reverse()
    for (const v of rest) s = play(s, v, { discovered: Math.ceil(conceptsOf(v).length / 2), correct: 3 })
    expect(conoceRappi(s)).toBe(false)
    s = play(s, last, { discovered: Math.ceil(conceptsOf(last).length / 2), correct: 3 })
    expect(conoceRappi(s)).toBe(true)
  })
})

describe('racha', () => {
  test('días seguidos suman, el mismo día no, un salto la reinicia', () => {
    let s = completeDay(initialState(), '2026-10-08')
    expect(s.streak.count).toBe(1)
    s = completeDay(s, '2026-10-09')
    expect(s.streak.count).toBe(2)
    s = completeDay(s, '2026-10-09')
    expect(s.streak.count).toBe(2)
    expect(currentStreak(s, '2026-10-10')).toBe(2)
    expect(currentStreak(s, '2026-10-12')).toBe(0)
    s = completeDay(s, '2026-10-11')
    expect(s.streak.count).toBe(1)
  })

  test('cruza cambio de mes y de año', () => {
    let s = completeDay(initialState(), '2026-10-31')
    s = completeDay(s, '2026-11-01')
    expect(s.streak.count).toBe(2)
    let y = completeDay(initialState(), '2026-12-31')
    y = completeDay(y, '2027-01-01')
    expect(y.streak.count).toBe(2)
  })

  test('today usa la fecha local, no UTC', () => {
    // Las pruebas corren con la hora de Chile (vite.config.js): las 23:30 locales ya son el día siguiente en UTC.
    expect(new Date(2026, 9, 8, 23, 30).toISOString().slice(0, 10)).toBe('2026-10-09')
    expect(today(new Date(2026, 9, 8, 23, 30))).toBe('2026-10-08')
    expect(today(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01')
  })

  test('la misión se reinicia al cambiar de día', () => {
    const s = discover(initialState(), 'turbo', conceptsOf('turbo')[0].id, '2026-10-08').state
    expect(dailyProgress(s, '2026-10-08').discovered).toBe(1)
    expect(dailyProgress(s, '2026-10-09').discovered).toBe(0)
  })
})

describe('cartas', () => {
  test('cada respuesta desbloquea una carta distinta de la vertical y luego generales', () => {
    let s = initialState()
    const own = factsOf('turbo').map((f) => f.id)
    const got = []
    for (let i = 0; i < own.length + 3; i++) {
      const res = answer(s, 'turbo', i % 2 === 0, D)
      s = res.state
      got.push(res.card?.id ?? null)
    }
    expect(got.slice(0, own.length)).toEqual(own)
    expect(got.slice(own.length, own.length + 2)).toEqual(['general-una-vertical', 'general-catalogo'])
    expect(got.at(-1)).toBeNull()
    expect(new Set(s.cards).size).toBe(s.cards.length)
    expect(FACTS.length).toBeGreaterThan(s.cards.length)
  })

  test('abrir una carta bloqueada no hace nada', () => {
    const s = openCard(initialState(), FACTS[0].id, D)
    expect(s.state.opened).toEqual([])
    expect(dailyProgress(s.state, D).opened).toBe(0)
  })
})

describe('ayudas', () => {
  test('seguir explorando lleva a la vertical con menos avance', () => {
    let s = initialState()
    for (const v of DATA.order.filter((x) => x !== 'farmacia')) s = play(s, v, { discovered: 1 })
    expect(nextVertical(s)).toBe('farmacia')
  })

  test('las funciones no mutan el estado', () => {
    const s = deepFreeze(initialState())
    const id = conceptsOf('turbo')[0].id
    expect(() => discover(s, 'turbo', id, D)).not.toThrow()
    expect(() => answer(s, 'turbo', true, D)).not.toThrow()
    const withCard = deepFreeze(answer(s, 'turbo', true, D).state)
    expect(() => openCard(withCard, withCard.cards[0], D)).not.toThrow()
    expect(s.xp).toBe(0)
  })
})
