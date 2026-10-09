import { DATA } from './data.js'
import { initialState } from './progress.js'
import { SCREEN_TO_GAME } from './verticals.js'

export const KEY = 'rappi-proto-juego-v1'
/** El pasaporte de antes del juego (ids de pantalla del prototipo): se traspasa una vez como verticales visitadas. */
export const LEGACY_PASSPORT_KEY = 'rappi-proto-pasaporte'

const browserStorage = () => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const isRecord = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
const optional = (x, check) => x === undefined || check(x)

// Cada campo con su forma: un valor raro guardado no puede romper Inicio en cada recarga.
const valid = (s) =>
  isRecord(s) &&
  s.version === 1 &&
  typeof s.xp === 'number' &&
  ['discovered', 'correct', 'answered'].every((k) => isRecord(s[k])) &&
  Object.values(s.discovered).every((ids) => Array.isArray(ids) && ids.every((id) => typeof id === 'string')) &&
  ['correct', 'answered'].every((k) => Object.values(s[k]).every(Number.isFinite)) &&
  Array.isArray(s.cards) &&
  Array.isArray(s.opened) &&
  optional(s.daily, (d) => isRecord(d) && ['discovered', 'correct', 'opened'].every((k) => typeof d[k] === 'number')) &&
  optional(s.streak, (r) => isRecord(r) && typeof r.count === 'number') &&
  optional(s.seenIntro, (b) => typeof b === 'boolean') &&
  optional(s.visited, (v) => Array.isArray(v) && v.every((id) => typeof id === 'string'))

const known = (ids) => ids.filter((id) => DATA.order.includes(id))

function fromLegacy(storage) {
  const old = JSON.parse(storage?.getItem(LEGACY_PASSPORT_KEY) ?? 'null')
  if (!Array.isArray(old)) return initialState()
  return { ...initialState(), visited: known([...new Set(old.map((id) => SCREEN_TO_GAME[id]))]) }
}

/** Progreso guardado en este navegador; si no hay, está roto o no se puede leer, parte en cero. */
export function load(storage = browserStorage()) {
  try {
    const raw = storage?.getItem(KEY)
    if (raw == null) return fromLegacy(storage)
    const parsed = JSON.parse(raw)
    if (!valid(parsed)) return initialState()
    const state = { ...initialState(), ...parsed }
    return { ...state, visited: known(state.visited) }
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
