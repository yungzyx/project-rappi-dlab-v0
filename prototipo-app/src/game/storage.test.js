import { describe, expect, test } from 'vitest'
import { datosOf } from './knowledge.js'
import { initialState } from './progress.js'
import { KEY, clear, load, save } from './storage.js'

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

describe('guardado local', () => {
  test('guarda y vuelve a cargar el mismo estado', () => {
    const store = memoryStorage()
    const state = { ...initialState(), xp: 130 }
    expect(save(state, store)).toBe(true)
    expect(load(store)).toEqual(state)
  })

  test('sin nada guardado parte en cero', () => {
    expect(load(memoryStorage())).toEqual(initialState())
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
  ])('un valor roto (%s) parte en cero', (raw) => {
    expect(load(memoryStorage({ [KEY]: raw }))).toEqual(initialState())
  })

  test('si el navegador no deja leer ni escribir, el juego sigue', () => {
    expect(load(broken)).toEqual(initialState())
    expect(save(initialState(), broken)).toBe(false)
    expect(clear(broken)).toBe(false)
  })

  test('sin localStorage disponible también sigue', () => {
    expect(load(null)).toEqual(initialState())
    expect(save(initialState(), null)).toBe(false)
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
    const loaded = load(memoryStorage({ [KEY]: JSON.stringify(old) }))
    expect(loaded.discovered).toEqual({ licores: [card], turbo: [] })
    expect(loaded.cards).toEqual([card])
    expect(loaded.opened).toEqual([])
    expect(loaded).toMatchObject({ xp: 340, streak: { count: 3, lastDate: '2026-10-08' }, visited: old.visited })
  })

  test('clear borra lo guardado', () => {
    const store = memoryStorage()
    save({ ...initialState(), xp: 10 }, store)
    expect(clear(store)).toBe(true)
    expect(load(store)).toEqual(initialState())
  })
})
