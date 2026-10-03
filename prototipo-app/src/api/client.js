// Cliente de la API de rappi-ia (Bigotes real: búsqueda híbrida, voz, foto y eventos).
// Si la API no responde, todo sigue funcionando con el cerebro local (src/assistant/brain.js).

const DEFAULT_PORT = 8000
const HEALTH_TTL_MS = 30_000
const HEALTH_TIMEOUT_MS = 1500
const CHAT_TIMEOUT_MS = 8_000 // más que esto, el público ya nota la espera: contesta el cerebro local
const UPLOAD_TIMEOUT_MS = 45_000

export const API_URL =
  import.meta.env.VITE_API_URL ??
  (typeof window !== 'undefined' ? `http://${window.location.hostname || 'localhost'}:${DEFAULT_PORT}` : '')

let healthCache = { at: 0, value: null }

// `signal` (opcional): quien llama también puede abortar (p. ej. "Cancelar" mientras se transcribe la voz).
async function request(path, { method = 'GET', body, timeout = CHAT_TIMEOUT_MS, json = true, signal } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', () => controller.abort(), { once: true })
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      body: json && body ? JSON.stringify(body) : body,
      headers: json && body ? { 'content-type': 'application/json' } : undefined,
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`API ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
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

function upload(path, field, file, context, { signal } = {}) {
  const form = new FormData()
  form.append(field, file)
  for (const [key, value] of Object.entries(context)) {
    if (value !== undefined && value !== null) form.append(key, value)
  }
  return request(path, { method: 'POST', body: form, json: false, timeout: UPLOAD_TIMEOUT_MS, signal })
}

export const chatVoice = (audio, context, options) => upload('/chat/voice', 'audio', audio, context, options)
export const chatPhoto = (image, context) => upload('/chat/photo', 'image', image, context)
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

const PLACEHOLDER_IMG =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"%3E%3Crect width="1" height="1" fill="%23f1f1f1"/%3E%3C/svg%3E'

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
    eta: '30 min',
    // Para registrar eventos y pedidos con los ids del catálogo real.
    entityType: p.entity_type,
    entityId: p.entity_id,
    concept: p.concept,
    vertical: p.vertical,
    ageRestricted: Boolean(p.age_restricted),
  }
}

// Nombre visible y pantalla del prototipo de cada vertical del backend. Turbo tiene su propia pantalla
// aunque la API lo agrupe con Express; restaurantes y Turbo no son una vertical genérica del prototipo.
const SUGGESTION_VERTICALS = {
  supermercado: 'Súper',
  licores: 'Licores',
  farmacia: 'Farmacia',
  mall: 'Rappi Mall',
  conveniencia: 'Express',
  turbo: 'Turbo',
  chocolateria: 'Chocolatería',
  restaurantes: 'Restaurantes',
}
const OWN_SCREENS = { turbo: ['turbo'], restaurantes: ['restaurants'] }

function suggestionRoute(vertical, prototypeVertical) {
  if (OWN_SCREENS[vertical]) return OWN_SCREENS[vertical]
  return prototypeVertical ? ['vertical', { id: prototypeVertical }] : null
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
        verticalLabel: SUGGESTION_VERTICALS[response.suggestion.vertical] ?? null,
        route: suggestionRoute(response.suggestion.vertical, response.suggestion.prototype_vertical),
        products: response.suggestion.products.map((p) => ({ ...toPrototypeProduct(p), fromSuggestion: true })),
      }
    : null
  return {
    text: response.text,
    products: (response.products ?? []).map(toPrototypeProduct),
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
    transcript: response.transcript ?? null,
    photo: response.photo ?? null,
    source: 'api',
  }
}
