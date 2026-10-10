import { describe, expect, test } from 'vitest'
import { cardsOf, datosOf, preguntasOf } from './knowledge.js'
import { PASSPORT_ORDER } from './verticals.js'
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

/** Descubre las primeras n tarjetas de una vertical y acierta desafíos del catálogo. */
function play(state, v, { discovered = 0, correct = 0, date = D } = {}) {
  let s = state
  for (const c of cardsOf(v).slice(0, discovered)) s = discover(s, v, c.id, date).state
  for (let i = 0; i < correct; i++) s = answer(s, v, true, date).state
  return s
}

/** Completa la misión del día en una fecha. */
function completeDay(state, date) {
  let s = state
  const v = 'supermercado'
  const fresh = cardsOf(v).filter((c) => !(s.discovered[v] ?? []).includes(c.id))
  s = discover(s, v, fresh[0].id, date).state
  s = discover(s, v, fresh[1].id, date).state
  s = answer(s, v, true, date).state
  s = openCard(s, fresh[0].id, date).state
  return s
}

describe('experiencia', () => {
  test('descubrir una tarjeta da 10 una sola vez por vertical', () => {
    const id = datosOf('turbo')[0].id
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

  test('acertar una pregunta nueva cuenta como dato nuevo de la misión del día; acertarla otra vez no', () => {
    const [pregunta] = preguntasOf('licores')
    const once = answer(initialState(), 'licores', true, D, pregunta.id).state
    expect(dailyProgress(once, D).discovered).toBe(1)
    const twice = answer(once, 'licores', true, D, pregunta.id).state
    expect(dailyProgress(twice, D).discovered).toBe(1)
    expect(dailyProgress(answer(initialState(), 'licores', false, D, pregunta.id).state, D).discovered).toBe(0)
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
  test('cuentan tarjetas: Explorador con 1, Conocedor con 6 y 3 aciertos, Experto con 12 y 8', () => {
    expect(cardsOf('chocolateria')).toHaveLength(12)
    const s0 = initialState()
    expect(verticalLevel(s0, 'chocolateria')).toBe('ninguno')
    expect(verticalLevel(play(s0, 'chocolateria', { discovered: 1 }), 'chocolateria')).toBe('explorador')
    expect(verticalLevel(play(s0, 'chocolateria', { discovered: 6, correct: 2 }), 'chocolateria')).toBe('explorador')
    expect(verticalLevel(play(s0, 'chocolateria', { discovered: 5, correct: 3 }), 'chocolateria')).toBe('explorador')
    expect(verticalLevel(play(s0, 'chocolateria', { discovered: 6, correct: 3 }), 'chocolateria')).toBe('conocedor')
    expect(verticalLevel(play(s0, 'chocolateria', { discovered: 12, correct: 7 }), 'chocolateria')).toBe('conocedor')
    expect(verticalLevel(play(s0, 'chocolateria', { discovered: 12, correct: 8 }), 'chocolateria')).toBe('experto')
    expect(verticalLevel(play(s0, 'viajes', { discovered: 6, correct: 3 }), 'viajes')).toBe('conocedor')
  })

  test('Conoce Rappi exige las 9 del pasaporte en Conocedor o más', () => {
    let s = initialState()
    const [last, ...rest] = [...PASSPORT_ORDER].reverse()
    for (const v of rest) s = play(s, v, { discovered: 6, correct: 3 })
    expect(conoceRappi(s)).toBe(false)
    s = play(s, last, { discovered: 6, correct: 3 })
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
    const s = discover(initialState(), 'turbo', datosOf('turbo')[0].id, '2026-10-08').state
    expect(dailyProgress(s, '2026-10-08').discovered).toBe(1)
    expect(dailyProgress(s, '2026-10-09').discovered).toBe(0)
  })
})

describe('tarjetas y álbum', () => {
  test('descubrir un dato lo suma al álbum', () => {
    const id = datosOf('turbo')[0].id
    expect(discover(initialState(), 'turbo', id, D).state.cards).toEqual([id])
  })

  test('acertar una pregunta de conocimiento la suma a lo descubierto y al álbum; fallar no', () => {
    const id = preguntasOf('viajes')[0].id
    const ok = answer(initialState(), 'viajes', true, D, id).state
    expect(ok.discovered.viajes).toEqual([id])
    expect(ok.cards).toEqual([id])
    const wrong = answer(initialState(), 'viajes', false, D, id).state
    expect(wrong.discovered.viajes ?? []).toEqual([])
    expect(wrong.cards).toEqual([])
  })

  test('acertar un desafío del catálogo suma el acierto pero no una tarjeta', () => {
    const s = answer(initialState(), 'turbo', true, D).state
    expect(s.correct.turbo).toBe(1)
    expect(s.cards).toEqual([])
  })

  test('abrir una carta que no está en el álbum no hace nada', () => {
    const s = openCard(initialState(), datosOf('turbo')[0].id, D)
    expect(s.state.opened).toEqual([])
    expect(dailyProgress(s.state, D).opened).toBe(0)
  })
})

describe('ayudas', () => {
  test('seguir explorando lleva a la vertical con menos avance', () => {
    let s = initialState()
    for (const v of PASSPORT_ORDER.filter((x) => x !== 'farmacia')) s = play(s, v, { discovered: 1 })
    expect(nextVertical(s)).toBe('farmacia')
  })

  test('las funciones no mutan el estado', () => {
    const s = deepFreeze(initialState())
    const id = datosOf('turbo')[0].id
    expect(() => discover(s, 'turbo', id, D)).not.toThrow()
    expect(() => answer(s, 'turbo', true, D, preguntasOf('turbo')[0].id)).not.toThrow()
    const withCard = deepFreeze(discover(s, 'turbo', id, D).state)
    expect(() => openCard(withCard, withCard.cards[0], D)).not.toThrow()
    expect(s.xp).toBe(0)
  })
})
