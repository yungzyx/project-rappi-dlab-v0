// Memoria de Mochi en la Home del prototipo final mientras dura la sesión: lo que ya mostró y lo último que la persona
// agregó al carro (Mochi lo comenta al volver). El pasaporte es el del juego de verticales (GameContext).
import { resetQuiet } from './mochiQuiet'

export const session = { played: false, lastAdded: null, newStamp: null, plan: null, planPrompted: false }

/** Lo último agregado al carro en el prototipo final (fuera de la Home): Mochi lo comenta al volver. */
export function rememberAdded(product) {
  session.lastAdded = product
}

/** La guía de la primera vez (3 pasos tras el saludo) ya se vio o se saltó: se recuerda en el navegador. */
export const TOUR_KEY = 'rappi-proto-guia-vista'

export function tourSeen() {
  try {
    return localStorage.getItem(TOUR_KEY) !== null
  } catch {
    return true // sin almacenamiento, mejor no repetirla en cada visita
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(TOUR_KEY, '1')
  } catch {
    // Sin almacenamiento: vale lo que dura la pestaña (la guía ya terminó).
  }
}

/** Evento de ventana con que se avisa a Mochi flotante que algo se agregó al carro (detalle: `{ product }`). */
export const MOCHI_CART_EVENT = 'mochi-carrito'

/** Evento de ventana con que el botón «Repetir escena» (fuera del teléfono) avisa a la Home. */
export const REPLAY_EVENT = 'bigotes-vivo-repetir'

/** «Repetir la escena»: vuelve al estado de una persona que abre la Home por primera vez (el juego también se reinicia). */
export function resetLive() {
  Object.assign(session, {
    played: false,
    lastAdded: null,
    newStamp: null,
    plan: null,
    planPrompted: false,
  })
  resetQuiet()
  try {
    localStorage.removeItem(TOUR_KEY)
  } catch {
    // Nada guardado que borrar.
  }
  window.dispatchEvent(new Event(REPLAY_EVENT))
}
