// Cliente de la API de rappi-ia (Mochi real: búsqueda híbrida y eventos).
// Sin la API la app muestra «Sin conexión con Mochi» (ver ConnectionGate).

import { VERTICAL_NAMES, routeForScreen, screenForBackend } from '../data/verticals'
import { PLACEHOLDER_IMG } from '../components/Img'

const DEFAULT_PORT = 8000
const HEALTH_TTL_MS = 30_000
const HEALTH_TIMEOUT_MS = 1500
const CHAT_TIMEOUT_MS = 8_000 // más que esto, el público ya nota la espera: contesta el cerebro local
const CONNECTION_TIMEOUT_MS = 5_000

export const API_URL =
  import.meta.env.VITE_API_URL ??
  (typeof window !== 'undefined' ? `http://${window.location.hostname || 'localhost'}:${DEFAULT_PORT}` : '')

let healthCache = { at: 0, value: null }

/**
 * Por qué falló una petición a la API: `offline` (no hay quien responda, o lo que responde no es la API),
 * `timeout` (no contestó a tiempo) o `http` (contestó con un error; `status` es su código).
 */
export class ApiError extends Error {
  constructor(kind, { status, cause } = {}) {
    super(kind === 'http' ? `API ${status}` : `API ${kind}`, { cause })
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
  }
}

export async function request(path, { method = 'GET', body, timeout = CHAT_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      signal: controller.signal,
    })
    if (!response.ok) throw new ApiError('http', { status: response.status })
    if (response.status === 204) return null
    return await response.json()
  } catch (error) {
    if (error instanceof ApiError) throw error
    // Solo el temporizador aborta; cualquier otro fallo (sin red, cuerpo que no es JSON) es una API que no está.
    throw new ApiError(controller.signal.aborted ? 'timeout' : 'offline', { cause: error })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * ¿Responde la API? Con sus capacidades y los documentos del catálogo, o el motivo (`offline`, `timeout`, `http`).
 * Lo que aprende lo comparte con `health()`: si no, el primer `health()` de la app (con su límite de 1,5 s) podría
 * guardar `null` 30 s aunque la API acabe de contestar.
 */
export async function checkConnection({ timeout = CONNECTION_TIMEOUT_MS } = {}) {
  try {
    const response = await request('/health', { timeout })
    // Lo que contesta JSON en /health pero no dice ok: true no es la API (otro servidor en el mismo puerto).
    if (response?.ok !== true) return { ok: false, kind: 'offline' }
    healthCache = { at: Date.now(), value: response.capacidades ?? null }
    return { ok: true, capabilities: response.capacidades, documents: response.documentos }
  } catch (error) {
    return { ok: false, kind: error.kind }
  }
}

/** Capacidades de la API ({ busqueda_semantica, fotos, voz, … }) o null si no está disponible. Se cachea 30 s. */
export async function health({ force = false } = {}) {
  if (!force && Date.now() - healthCache.at < HEALTH_TTL_MS) return healthCache.value
  let value
  try {
    value = (await request('/health', { timeout: HEALTH_TIMEOUT_MS })).capacidades
  } catch {
    value = null
  }
  healthCache = { at: Date.now(), value }
  return value
}

export function resetHealthCache() {
  healthCache = { at: 0, value: null }
}

/** Si falla, la próxima pregunta vuelve a revisar /health en vez de fiarse del caché de 30 s. */
export async function chat(payload) {
  try {
    return await request('/chat', { method: 'POST', body: payload })
  } catch (error) {
    resetHealthCache()
    throw error
  }
}

export const profile = (userId) => request(`/profile/${encodeURIComponent(userId)}`, { timeout: 4000 })
export const forget = (userId) => request(`/profile/${encodeURIComponent(userId)}`, { method: 'DELETE', timeout: 4000 })
export const recommendations = (userId, vertical) =>
  request(`/recommendations?user_id=${encodeURIComponent(userId)}${vertical ? `&vertical=${vertical}` : ''}`, {
    timeout: 8000,
  })
export const sendEvents = (userId, events) =>
  request('/events', { method: 'POST', body: { user_id: userId, events }, timeout: 5000 })
export const sendOrder = (order) => request('/orders', { method: 'POST', body: order, timeout: 5000 })

/**
 * Al cerrar la pestaña: envío que el navegador completa aunque la página se descargue. Va como text/plain a
 * /events/beacon (mismo JSON que /events): con application/json el navegador pediría un preflight CORS
 * que el beacon no puede hacer, y el envío se bloquearía.
 */
export function beaconEvents(userId, events) {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon || events.length === 0) return false
  const blob = new Blob([JSON.stringify({ user_id: userId, events })], { type: 'text/plain' })
  return navigator.sendBeacon(`${API_URL}/events/beacon`, blob)
}

// ── De la API al formato del prototipo ──────────────────────────────────────


/** Producto de la API → tarjeta del prototipo (mismo formato que src/data/catalog.js). */
export function toPrototypeProduct(p) {
  return {
    id: p.id,
    name: p.name,
    img: p.img || PLACEHOLDER_IMG,
    price: p.price,
    before: p.before ?? undefined,
    discount: p.discount ?? undefined,
    store: p.store ?? undefined,
    // Tienda a la que pertenece: en un plato es el restaurante (se abre por su menú), no una tienda.
    storeId: p.store_id ?? undefined,
    size: p.presentation ?? undefined,
    // La API no sabe el tiempo de entrega de un producto: no se inventa uno.
    eta: undefined,
    etaIcon: 'none',
    // Para registrar eventos y pedidos con los ids del catálogo real.
    entityType: p.entity_type,
    entityId: p.entity_id,
    concept: p.concept,
    // La vertical que usa la app es la del prototipo (la misma de la línea del carrito, sea cual sea la pantalla de
    // origen); la del backend se guarda para el pedido.
    vertical: screenForBackend(p.vertical) ?? p.vertical,
    backendVertical: p.vertical,
    ageRestricted: Boolean(p.age_restricted),
  }
}

/** Nombre visible y ruta de una vertical de la API (null si el prototipo no la conoce). */
function verticalView(vertical) {
  const screen = screenForBackend(vertical)
  return screen ? { label: VERTICAL_NAMES[screen], route: routeForScreen(screen) } : { label: null, route: null }
}

/** Respuesta de /chat → mensaje del chat del prototipo ({ text, products, reason, actions, suggestion… }). */
export function toMessage(response) {
  const suggestion = response.suggestion
    ? {
        reason: response.suggestion.reason,
        question: response.suggestion.question,
        concept: response.suggestion.concept,
        // Código del backend para los eventos ('turbo' no es el 'express' del prototipo, que la API lee como conveniencia).
        vertical: response.suggestion.vertical,
        verticalLabel: verticalView(response.suggestion.vertical).label,
        route: verticalView(response.suggestion.vertical).route,
        // El gancho de un servicio (RappiTravel) se mide con su origen; las demás, como sugerencia del chat.
        origin: response.service ?? 'chat',
        products: response.suggestion.products.map((p) => ({
          ...toPrototypeProduct(p),
          fromSuggestion: true,
          suggestionOrigin: response.service ?? 'chat',
        })),
      }
    : null
  const alsoIn = response.also_in
    ? {
        label: response.also_in.label,
        verticals: response.also_in.verticals.map((v) => ({
          label: verticalView(v.vertical).label ?? v.vertical,
          route: verticalView(v.vertical).route,
          items: v.items,
          stores: v.stores,
        })),
      }
    : null
  return {
    text: response.text,
    service: response.service ?? null,
    products: (response.products ?? []).map(toPrototypeProduct),
    alsoIn,
    // La razón visible va con la sugerencia cruzada; aquí no se repite.
    reason: suggestion ? null : response.reason,
    suggestion,
    // Acciones de aclaración ("¿para pedir ya o para el súper?"): vuelven a preguntar con ese vertical.
    actions: (response.actions ?? []).map((a) =>
      a.query ? { label: a.label, ask: { text: a.query, vertical: a.vertical } } : a,
    ),
    tags: response.tags ?? [],
    concepts: response.intent?.concepts ?? [],
    unmet: Boolean(response.unmet),
    ageNotice: Boolean(response.age_notice),
    source: 'api',
  }
}
