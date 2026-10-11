// Cliente de la API de rappi-ia para el panel. Si una consulta de datos simulados o del catálogo falla o tarda
// demasiado, usa la respuesta guardada en src/fixtures (npm run fixtures, make contract) y la anota, con el origen y la
// fecha que trae el archivo, para avisar que el panel está en modo sin conexión. El uso del MVP (fuente prototipo) no
// tiene respaldo: sin la base viva no hay nada honesto que mostrar.
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')
// /analytics/weekly tardó entre 7 y 28 s en las pruebas (según la carga de la máquina); el resto, menos de 1 s.
export const TIMEOUT_MS = 30_000

export const SOURCES = ['synthetic', 'prototype']
export const CATALOG = 'catalog'
const CATALOG_SOURCE = 'catalogo_real'

// Solo las respuestas que usa el panel (concepts.json y health.json quedan como referencia de la API).
const savedResponses = import.meta.glob(['../fixtures/catalog.json', '../fixtures/*.{synthetic,prototype}.json'], {
  import: 'default',
})

const cache = new Map()
const listeners = new Set()
let fallbacks = [] // [{ key, name, reason }]; se reemplaza (nunca se muta) para useSyncExternalStore

function describeRequest(name, source) {
  if (name === CATALOG) return { key: CATALOG, name, path: '/analytics/catalog', expected: CATALOG_SOURCE }
  if (!SOURCES.includes(source)) throw new Error(`Fuente desconocida: ${source}`)
  return { key: `${name}.${source}`, name, path: `/analytics/${name}?source=${source}`, expected: source }
}

class HttpError extends Error {}

/** Nunca mezclar fuentes: una respuesta que no trae la fuente pedida se descarta. */
function dataFrom(body, expected) {
  if (body?.source !== expected || body.data == null) {
    throw new Error(`Se esperaba la fuente ${expected} y llegó ${body?.source ?? 'otra cosa'}`)
  }
  return body.data
}

async function fetchLive({ path, expected }) {
  const response = await fetch(`${API_URL}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) throw new HttpError(`respondió ${response.status}`)
  return dataFrom(await response.json(), expected)
}

async function fetchSaved({ key, expected }) {
  const load = savedResponses[`../fixtures/${key}.json`]
  if (!load) throw new Error(`Sin conexión y sin datos guardados para "${key}"`)
  const body = await load()
  return { data: dataFrom(body, expected), saved: body.guardado ?? null }
}

/** Motivo legible de por qué no se usó la respuesta en vivo. */
function reasonFor(error) {
  if (error.name === 'TimeoutError') return `no respondió en ${TIMEOUT_MS / 1000} s`
  if (error instanceof HttpError) return error.message
  if (error instanceof TypeError) return 'no responde'
  return 'respuesta no válida'
}

const PROTOTYPE_OFFLINE_MESSAGE = 'La API no responde: el uso del MVP solo se ve con la base viva.'

/** `isCurrent` dice si esta petición sigue siendo la de la caché: una vieja que falla tarde no ensucia el aviso. */
async function loadWithFallback(request, isCurrent) {
  try {
    return { data: await fetchLive(request), offline: false, saved: null }
  } catch (error) {
    if (request.expected === 'prototype') throw new Error(PROTOTYPE_OFFLINE_MESSAGE, { cause: error })
    console.warn(`rappi-ia: ${request.path} falló (${error.message}); se usan los datos guardados.`)
    const { data, saved } = await fetchSaved(request)
    if (isCurrent()) addFallback({ key: request.key, name: request.name, reason: reasonFor(error), guardado: saved })
    return { data, offline: true, saved }
  }
}

/**
 * Promesa (en caché por métrica y fuente) con `{ data, offline, saved }`; `saved` es el `guardado` del archivo
 * (`{ origen, fecha }`) cuando se usó una respuesta guardada. `name` es una métrica de /analytics o 'catalog'.
 * Con la fuente prototipo, si la API falla la promesa se rechaza.
 */
export function loadAnalytics(name, source) {
  const request = describeRequest(name, source)
  if (!cache.has(request.key)) {
    const promise = loadWithFallback(request, () => cache.get(request.key) === promise)
    promise.catch(() => {}) // quien la lea la ve rechazada; las que nadie alcanza a leer no son un error sin atender
    cache.set(request.key, promise)
  }
  return cache.get(request.key)
}

function notify() {
  listeners.forEach((listener) => listener())
}

function addFallback(fallback) {
  if (fallbacks.some((item) => item.key === fallback.key)) return
  fallbacks = [...fallbacks, fallback]
  notify()
}

export function subscribeConnection(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Consultas que se mostraron con datos guardados (vacío = todo en vivo). */
export function getFallbacks() {
  return fallbacks
}

/** Olvida lo cargado para volver a intentar con la API. */
export function retryConnection() {
  cache.clear()
  fallbacks = []
  notify()
}

/**
 * Olvida lo cargado de una fuente, para ver lo nuevo (p. ej. lo que se hizo en el prototipo durante la demo).
 * La caché no expira sola: /analytics/weekly tarda segundos y no se vuelve a pedir sin que alguien lo pida.
 */
export function refreshSource(source) {
  const suffix = `.${source}`
  for (const key of cache.keys()) if (key.endsWith(suffix)) cache.delete(key)
  fallbacks = fallbacks.filter((fallback) => !fallback.key.endsWith(suffix))
  notify()
}
