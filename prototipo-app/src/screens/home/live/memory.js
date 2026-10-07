// Memoria del modo «Bigotes vivo» mientras dura la sesión: lo que ya mostró, el orden de la Home y lo último que la
// persona agregó al carro (Bigotes lo comenta al volver). El pasaporte de verticales se guarda en el navegador.
const PASSPORT_KEY = 'rappi-proto-pasaporte'

/** Verticales del pasaporte, en el orden en que se muestran (ids de pantalla del prototipo). */
export const PASSPORT = [
  { id: 'restaurants', emoji: '🍔' },
  { id: 'grocery', emoji: '🛒' },
  { id: 'turbo', emoji: '⚡' },
  { id: 'liquor', emoji: '🍷' },
  { id: 'chocolates', emoji: '🍫' },
  { id: 'express', emoji: '🏪' },
  { id: 'retail', emoji: '🛍️' },
  { id: 'pet', emoji: '🐶' },
  { id: 'pharmacy', emoji: '💊' },
]
const VALID = new Set(PASSPORT.map((stamp) => stamp.id))
const STARTER = ['restaurants', 'grocery'] // lo que una persona típica ya usa
/** Sellos que dan el premio de la demo (envío gratis): un incentivo para probar verticales nuevas. */
export const PASSPORT_GOAL = 4

export const session = { played: false, order: null, lastAdded: null, newStamp: null, plan: null, planPrompted: false }

export function loadPassport() {
  try {
    const saved = JSON.parse(localStorage.getItem(PASSPORT_KEY))
    if (Array.isArray(saved)) return saved.filter((id) => VALID.has(id))
  } catch {
    // Sin almacenamiento: el pasaporte parte de cero en cada recarga.
  }
  return [...STARTER]
}

function savePassport(stamps) {
  try {
    localStorage.setItem(PASSPORT_KEY, JSON.stringify(stamps))
  } catch {
    // Sin almacenamiento: los sellos duran hasta recargar.
  }
}

/** Sella una vertical. Devuelve los sellos; si es nueva, la Home la celebra al volver. */
export function stamp(vertical) {
  const stamps = loadPassport()
  if (!VALID.has(vertical) || stamps.includes(vertical)) return stamps
  const next = [...stamps, vertical]
  savePassport(next)
  session.newStamp = vertical
  return next
}

/** Lo último agregado al carro en modo vivo (fuera de la Home): Bigotes lo comenta al volver. */
export function rememberAdded(product) {
  session.lastAdded = product
}

/** Evento de ventana con que el botón «Repetir escena» (fuera del teléfono) avisa a la Home. */
export const REPLAY_EVENT = 'bigotes-vivo-repetir'

/** «Repetir la escena»: vuelve al estado de una persona que abre la Home por primera vez. */
export function resetLive() {
  Object.assign(session, {
    played: false,
    order: null,
    lastAdded: null,
    newStamp: null,
    plan: null,
    planPrompted: false,
  })
  savePassport([...STARTER])
  window.dispatchEvent(new Event(REPLAY_EVENT))
}
