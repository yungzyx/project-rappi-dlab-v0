import { describe, expect, test } from 'vitest'
import { datosOf } from './knowledge.js'
import { initialState } from './progress.js'
import { KEY, LEGACY_PASSPORT_KEY, clearLegacy, legacyProgress } from './storage.js'

function memoryStorage(initial = {}) {
  const data = { ...initial }
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v)
    },
    removeItem: (k) => {
      delete data[k]
    },
    data,
  }
}

const broken = {
  getItem: () => {
    throw new Error('bloqueado')
  },
  setItem: () => {
    throw new Error('lleno')
  },
  removeItem: () => {
    throw new Error('bloqueado')
  },
}

describe('progreso viejo del navegador', () => {
  test('lee el progreso que guardó el juego antes', () => {
    const state = { ...initialState(), xp: 130 }
    expect(legacyProgress(memoryStorage({ [KEY]: JSON.stringify(state) }))).toEqual(state)
  })

  test('sin nada guardado no hay nada que traspasar', () => {
    expect(legacyProgress(memoryStorage())).toBeNull()
  })

  test('leerlo no toca el almacenamiento: borrarlo es aparte', () => {
    const store = memoryStorage({ [KEY]: JSON.stringify(initialState()), [LEGACY_PASSPORT_KEY]: '["grocery"]' })
    legacyProgress(store)
    expect(Object.keys(store.data).sort()).toEqual([LEGACY_PASSPORT_KEY, KEY].sort())
  })

  const base = { version: 1, xp: 5, discovered: {}, correct: {}, answered: {}, cards: [], opened: [] }
  const odd = (patch) => JSON.stringify({ ...base, ...patch })
  test.each([
    '{',
    'null',
    '42',
    '{"version":0,"xp":5}',
    '{"version":1,"xp":"mucho"}',
    odd({ discovered: null }),
    odd({ discovered: [] }),
    odd({ correct: null }),
    odd({ answered: 'x' }),
    odd({ cards: {} }),
    odd({ opened: null }),
    odd({ daily: null }),
    odd({ streak: null }),
    odd({ streak: { count: 'dos', lastDate: null } }),
    odd({ seenIntro: 'sí' }),
    odd({ correct: { turbo: 'x' } }),
    odd({ discovered: { turbo: [3] } }),
  ])('un valor roto (%s) no se traspasa', (raw) => {
    expect(legacyProgress(memoryStorage({ [KEY]: raw }))).toBeNull()
  })

  test('si el navegador no deja leer ni borrar, el juego sigue', () => {
    expect(legacyProgress(broken)).toBeNull()
    expect(clearLegacy(broken)).toBe(false)
  })

  test('sin localStorage disponible también sigue', () => {
    expect(legacyProgress(null)).toBeNull()
    expect(clearLegacy(null)).toBe(false)
  })

  test('un progreso guardado con conceptos y cartas viejas se carga sin ids huérfanos y conserva sellos, XP y racha', () => {
    const card = datosOf('licores')[0].id
    const old = {
      ...initialState(),
      xp: 340,
      streak: { count: 3, lastDate: '2026-10-08' },
      visited: ['supermercado', 'restaurantes', 'licores'],
      discovered: { licores: ['vino', 'cerveza', card], turbo: ['frutas'] },
      cards: ['licores-tamano', card],
      opened: ['licores-tamano'],
    }
    const loaded = legacyProgress(memoryStorage({ [KEY]: JSON.stringify(old) }))
    expect(loaded.discovered).toEqual({ licores: [card], turbo: [] })
    expect(loaded.cards).toEqual([card])
    expect(loaded.opened).toEqual([])
    expect(loaded).toMatchObject({ xp: 340, streak: { count: 3, lastDate: '2026-10-08' }, visited: old.visited })
  })

  test('clearLegacy borra el progreso y el pasaporte viejo', () => {
    const store = memoryStorage({ [KEY]: JSON.stringify({ ...initialState(), xp: 10 }), [LEGACY_PASSPORT_KEY]: '[]' })
    expect(clearLegacy(store)).toBe(true)
    expect(store.data).toEqual({})
    expect(legacyProgress(store)).toBeNull()
  })
})
