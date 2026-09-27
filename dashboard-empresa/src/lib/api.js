// Cliente de la API de rappi-ia para el panel. Si una consulta falla o tarda demasiado, usa la respuesta guardada
// en src/fixtures (npm run fixtures) y la anota para avisar que el panel está en modo sin conexión.
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
  return dataFrom(await load(), expected)
}

/** Motivo legible de por qué no se usó la respuesta en vivo. */
function reasonFor(error) {
  if (error.name === 'TimeoutError') return `no respondió en ${TIMEOUT_MS / 1000} s`
  if (error instanceof HttpError) return error.message
  if (error instanceof TypeError) return 'no responde'
  return 'respuesta no válida'
}

async function loadWithFallback(request) {
  try {
    return { data: await fetchLive(request), offline: false }
  } catch (error) {
    console.warn(`rappi-ia: ${request.path} falló (${error.message}); se usan los datos guardados.`)
    const data = await fetchSaved(request)
    addFallback({ key: request.key, name: request.name, reason: reasonFor(error) })
    return { data, offline: true }
  }
}

/** Promesa (en caché por métrica y fuente) con `{ data, offline }`. `name` es una métrica de /analytics o 'catalog'. */
export function loadAnalytics(name, source) {
  const request = describeRequest(name, source)
  if (!cache.has(request.key)) cache.set(request.key, loadWithFallback(request))
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
