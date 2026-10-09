import { describe, expect, test } from 'vitest'
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

  test.each(['{', 'null', '42', '{"version":0,"xp":5}', '{"version":1,"xp":"mucho"}'])(
    'un valor roto (%s) parte en cero',
    (raw) => {
      expect(load(memoryStorage({ [KEY]: raw }))).toEqual(initialState())
    },
  )

  test('si el navegador no deja leer ni escribir, el juego sigue', () => {
    expect(load(broken)).toEqual(initialState())
    expect(save(initialState(), broken)).toBe(false)
    expect(clear(broken)).toBe(false)
  })

  test('sin localStorage disponible también sigue', () => {
    expect(load(null)).toEqual(initialState())
    expect(save(initialState(), null)).toBe(false)
  })

  test('clear borra lo guardado', () => {
    const store = memoryStorage()
    save({ ...initialState(), xp: 10 }, store)
    expect(clear(store)).toBe(true)
    expect(load(store)).toEqual(initialState())
  })
})
