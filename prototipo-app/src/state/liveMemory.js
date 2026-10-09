// Memoria de Bigotes en la Home del prototipo final mientras dura la sesión: lo que ya mostró y lo último que la persona
// agregó al carro (Bigotes lo comenta al volver). El pasaporte es el del juego de verticales (GameContext).

export const session = { played: false, lastAdded: null, newStamp: null, plan: null, planPrompted: false }

/** Lo último agregado al carro en el prototipo final (fuera de la Home): Bigotes lo comenta al volver. */
export function rememberAdded(product) {
  session.lastAdded = product
}

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
  window.dispatchEvent(new Event(REPLAY_EVENT))
}
