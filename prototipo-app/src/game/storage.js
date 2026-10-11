import { initialState } from './progress.js'
import { cardById } from './knowledge.js'
import { PASSPORT_ORDER, SCREEN_TO_GAME } from './verticals.js'

// El progreso del juego vive en el servidor. Esto es lo que queda para traspasar, una vez, lo que este navegador
// guardó antes de eso (nunca se escribe): leerlo con `legacyProgress` y borrarlo con `clearLegacy`.
export const KEY = 'rappi-proto-juego-v1'
/** El pasaporte de antes del juego (ids de pantalla del prototipo): se traspasa como verticales visitadas. */
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

const known = (ids) => ids.filter((id) => PASSPORT_ORDER.includes(id))

// Lo guardado antes eran conceptos y cartas del catálogo: solo quedan las tarjetas de conocimiento que existen.
const isCard = (id) => Boolean(cardById(id))
const withKnownCards = (state) => ({
  discovered: Object.fromEntries(Object.entries(state.discovered).map(([v, ids]) => [v, ids.filter(isCard)])),
  cards: state.cards.filter(isCard),
  opened: state.opened.filter(isCard),
})

/** El pasaporte viejo como progreso (sus ids de pantalla pasan a verticales visitadas); null si no hay o está roto. */
function fromLegacy(storage) {
  const old = JSON.parse(storage.getItem(LEGACY_PASSPORT_KEY) ?? 'null')
  if (!Array.isArray(old)) return null
  return { ...initialState(), visited: known([...new Set(old.map((id) => SCREEN_TO_GAME[id]))]) }
}

/**
 * El progreso que este navegador guardó antes de que viviera en el servidor, ya limpio (sin tarjetas que no existen ni
 * verticales desconocidas), o null si no hay, está roto o no se puede leer. El pasaporte viejo solo cuenta si no hay
 * progreso del juego. No toca el almacenamiento: borrarlo es `clearLegacy`, cuando ya llegó al servidor.
 */
export function legacyProgress(storage = browserStorage()) {
  try {
    const raw = storage?.getItem(KEY)
    if (raw == null) return storage ? fromLegacy(storage) : null
    const parsed = JSON.parse(raw)
    if (!valid(parsed)) return null
    const state = { ...initialState(), ...parsed }
    return { ...state, ...withKnownCards(state), visited: known(state.visited) }
  } catch {
    return null
  }
}

/** Borra el progreso viejo del navegador (el del juego y el pasaporte anterior). Devuelve false si no pudo. */
export function clearLegacy(storage = browserStorage()) {
  try {
    if (!storage) return false
    storage.removeItem(KEY)
    storage.removeItem(LEGACY_PASSPORT_KEY)
    return true
  } catch {
    return false
  }
}
