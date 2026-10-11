import { initialState } from './progress.js'
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

// Las tarjetas que el progreso viejo nombra NO se filtran aquí: al leerlo el registro de tarjetas aún no llegó de la API
// (vacío, se perderían todas). Quien sabe cuáles existen es el servidor, que las quita al guardar.
const MAX_ITEMS = 200 // los límites de la API (PUT /game/state)
const MAX_KEYS = 20
const MAX_ID = 64

const count = (n) => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0)
const ids = (list) => (Array.isArray(list) ? list.filter((id) => typeof id === 'string' && id && id.length <= MAX_ID).slice(0, MAX_ITEMS) : [])
const date = (d) => (typeof d === 'string' && d.length <= MAX_ID ? d : null)
const byVertical = (values, each) =>
  Object.fromEntries(
    Object.entries(isRecord(values) ? values : {})
      .filter(([vertical]) => vertical.length <= MAX_ID)
      .slice(0, MAX_KEYS)
      .map(([vertical, value]) => [vertical, each(value)]),
  )

/** El progreso viejo reducido a la forma exacta que acepta la API (la de `initialState()`): sin claves de más, con enteros >= 0. */
function toServerShape(state) {
  const empty = initialState()
  const daily = isRecord(state.daily) ? state.daily : empty.daily
  const streak = isRecord(state.streak) ? state.streak : empty.streak
  return {
    version: 1,
    xp: count(state.xp),
    discovered: byVertical(state.discovered, ids),
    correct: byVertical(state.correct, count),
    answered: byVertical(state.answered, count),
    cards: ids(state.cards),
    opened: ids(state.opened),
    daily: {
      date: date(daily.date),
      discovered: count(daily.discovered),
      correct: count(daily.correct),
      opened: count(daily.opened),
      done: daily.done === true,
    },
    streak: { count: count(streak.count), lastDate: date(streak.lastDate) },
    seenIntro: state.seenIntro === true,
    visited: ids(known(state.visited ?? empty.visited)),
  }
}

/** El pasaporte viejo como progreso (sus ids de pantalla pasan a verticales visitadas); null si no hay o está roto. */
function fromLegacy(storage) {
  const old = JSON.parse(storage.getItem(LEGACY_PASSPORT_KEY) ?? 'null')
  if (!Array.isArray(old)) return null
  return { ...initialState(), visited: known([...new Set(old.map((id) => SCREEN_TO_GAME[id]))]) }
}

/**
 * El progreso que este navegador guardó antes de que viviera en el servidor, con la forma que acepta la API (sin claves
 * de más ni verticales desconocidas; las tarjetas que ya no existen las quita el servidor), o null si no hay, está roto
 * o no se puede leer. El pasaporte viejo solo cuenta si no hay progreso del juego. No toca el almacenamiento: borrarlo
 * es `clearLegacy`, cuando ya llegó al servidor.
 */
export function legacyProgress(storage = browserStorage()) {
  try {
    const raw = storage?.getItem(KEY)
    if (raw == null) return storage ? fromLegacy(storage) : null
    const parsed = JSON.parse(raw)
    if (!valid(parsed)) return null
    return toServerShape({ ...initialState(), ...parsed })
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
