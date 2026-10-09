import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import { beaconEvents, health, sendEvents } from '../api/client'
import { useDemo } from './DemoContext'

// Eventos de uso para el panel de la empresa (búsquedas, carrito, sugerencias, pedidos). Se envían en lotes a
// rappi-ia; sin API, se descartan en silencio. En "Rappi hoy" se envían sin concepto: Bigotes no aprende.
const USER_KEY = 'rappi-proto-user'
const SESSION_KEY = 'rappi-proto-session'
const SESSION_IDLE_MS = 30 * 60 * 1000 // una sesión termina tras 30 min sin actividad
const FLUSH_MS = 5000
const MAX_QUEUE = 200
// Largo máximo de los textos en rappi-ia (EventIn): uno más largo haría rechazar (422) el lote completo.
const FIELD_LIMITS = { query: 500, entity_id: 64, cart_id: 64, session_id: 64 }

function withinLimits(event) {
  const clipped = { ...event }
  for (const [field, max] of Object.entries(FIELD_LIMITS)) {
    if (typeof clipped[field] === 'string') clipped[field] = clipped[field].slice(0, max)
  }
  return clipped
}

// randomUUID solo existe en contexto seguro (https o localhost): abierta por la IP de la red (iPhone) no está, y el
// respaldo con la hora daba ids adivinables. getRandomValues sí funciona por http.
function randomId(prefix) {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8))
  return `${prefix}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

function readStore(storage, key) {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function writeStore(storage, key, value) {
  try {
    storage.setItem(key, value)
  } catch {
    // Modo privado: el id vive solo en memoria.
  }
}

/** Id seudónimo de este navegador (no es una cuenta ni un dato personal). */
export function userId() {
  let id = readStore(localStorage, USER_KEY)
  if (!id) {
    id = randomId('proto')
    writeStore(localStorage, USER_KEY, id)
  }
  return id
}

/** Sesión vigente (se renueva tras 30 min sin actividad), con `change` aplicado a lo que vive con ella. */
function touchSession(now, change = (session) => session) {
  let stored
  try {
    stored = JSON.parse(readStore(sessionStorage, SESSION_KEY))
  } catch {
    stored = null
  }
  const session = stored && now - stored.lastAt < SESSION_IDLE_MS ? stored : { id: randomId('s'), lastAt: now }
  const next = change({ ...session, lastAt: now })
  writeStore(sessionStorage, SESSION_KEY, JSON.stringify(next))
  return next
}

/** Sesión actual; se renueva tras 30 min sin actividad. */
export function sessionId(now = Date.now()) {
  return touchSession(now).id
}

/**
 * Temas que Bigotes ya sugirió en la sesión (chat y «Para ti»): una sugerencia por tema por sesión. Viven con la
 * sesión, así que recargar la página no los olvida y una sesión nueva empieza sin ellos.
 */
export function shownTopics(now = Date.now()) {
  return touchSession(now).topics ?? []
}

export function noteShownTopic(concept, now = Date.now()) {
  touchSession(now, (session) => ({ ...session, topics: [...new Set([...(session.topics ?? []), concept])] }))
}

export function clearShownTopics(now = Date.now()) {
  touchSession(now, (session) => ({ ...session, topics: [] }))
}

const EventsContext = createContext(null)

export function EventsProvider({ children }) {
  const demo = useDemo()
  const queue = useRef([])
  const opened = useRef(false)
  // Lotes que ya salieron: "Olvidar" los espera para que no recreen en el servidor lo que se borra.
  const inFlight = useRef(Promise.resolve())
  const proposal = useRef(demo.isFinal)
  useEffect(() => {
    proposal.current = demo.isFinal
  }, [demo.isFinal])

  const flush = useCallback(async () => {
    if (queue.current.length === 0) return
    const batch = queue.current.splice(0, MAX_QUEUE)
    const sending = (async () => {
      if (!(await health())) return // sin API no hay a quién enviarlos
      try {
        await sendEvents(userId(), batch)
      } catch {
        // Evento perdido: es telemetría de la demo, no se reintenta.
      }
    })()
    inFlight.current = Promise.all([inFlight.current, sending])
    await sending
  }, [])

  const track = useCallback((type, fields = {}) => {
    const event = withinLimits({ type, session_id: sessionId(), ...fields })
    if (!proposal.current) delete event.concept_id
    queue.current.push(event)
    if (queue.current.length > MAX_QUEUE) queue.current.shift()
  }, [])

  useEffect(() => {
    if (!opened.current) track('app_open') // StrictMode monta dos veces en desarrollo
    opened.current = true
    const timer = setInterval(flush, FLUSH_MS)
    const onHide = () => {
      if (beaconEvents(userId(), queue.current)) queue.current = []
    }
    window.addEventListener('pagehide', onHide)
    return () => {
      clearInterval(timer)
      window.removeEventListener('pagehide', onHide)
    }
  }, [flush, track])

  /** Descarta lo que aún no se envía (p. ej. al "Olvidar": si no, volvería a aparecer en el servidor). */
  const clear = useCallback(() => {
    queue.current = []
  }, [])

  /** Se cumple cuando terminan los lotes ya enviados. */
  const settled = useCallback(() => inFlight.current, [])

  const value = useMemo(() => ({ track, flush, clear, settled }), [track, flush, clear, settled])
  return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>
}

const NOOP = { track: () => {}, flush: async () => {}, clear: () => {}, settled: async () => {} }
/** Fuera del proveedor (tests de componentes sueltos) no registra nada. */
export const useEvents = () => useContext(EventsContext) ?? NOOP
