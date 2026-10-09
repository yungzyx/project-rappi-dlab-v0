import { initialState } from './progress.js'

export const KEY = 'juego-verticales-v1'

const browserStorage = () => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const valid = (s) =>
  s !== null &&
  typeof s === 'object' &&
  s.version === 1 &&
  typeof s.xp === 'number' &&
  typeof s.discovered === 'object' &&
  Array.isArray(s.cards)

/** Progreso guardado en este navegador; si no hay, está roto o no se puede leer, parte en cero. */
export function load(storage = browserStorage()) {
  try {
    const parsed = JSON.parse(storage?.getItem(KEY) ?? 'null')
    return valid(parsed) ? { ...initialState(), ...parsed } : initialState()
  } catch {
    return initialState()
  }
}

/** Devuelve false si no se pudo guardar (modo privado, almacenamiento lleno o bloqueado): el juego sigue igual. */
export function save(state, storage = browserStorage()) {
  try {
    if (!storage) return false
    storage.setItem(KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function clear(storage = browserStorage()) {
  try {
    if (!storage) return false
    storage.removeItem(KEY)
    return true
  } catch {
    return false
  }
}
