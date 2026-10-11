import { forget, renewSession } from '../api/client'
import { ordersSettled } from '../api/orders'
import { clearSession, userId } from '../api/user'
import { clearShownTopics, useEvents } from './EventsContext'
import { useGame } from './GameContext'
import { reloadToHome } from './reloadApp'

// Todo lo que el prototipo guarda en este navegador lleva este prefijo (localStorage y sessionStorage).
const PREFIX = 'rappi-proto-'

function wipe(storage) {
  try {
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key) => key?.startsWith(PREFIX))
    for (const key of keys) storage.removeItem(key)
  } catch {
    // Sin almacenamiento no hay nada que borrar.
  }
}

/**
 * «Borrar mis datos» / «Olvidar»: lo que el servidor sabe de esta persona y lo que guardó este navegador.
 * 1. Vacía la cola de eventos antes de cualquier espera (y otra vez después de `settle`), para que nada salga de nuevo.
 * 2. Espera lo que ya iba en camino (`settle`: las preguntas del buscador; lotes de eventos; el guardado del juego,
 *    que queda en pausa; pedidos) y recién ahí llama `DELETE /profile/{id}`. Si falla, el juego retoma su guardado y
 *    el error sube a quien llamó: no se toca nada local.
 * 3. Si salió bien: borra las claves `rappi-proto-*` (también el id y el token de la sesión), deja el juego en cero (sin
 *    subirlo, subirlo recrearía al usuario), pide a la API una sesión nueva (otra persona, sin el id viejo; si falla, la
 *    app la pide al abrir) y recarga la app en la Home (`reload`; solo si salió bien) para que nada quede en memoria.
 * `events` y `game` son los de sus contextos; `profile` (opcional) sube la «generación» del perfil.
 */
export async function forgetAll({ events, game, profile, settle, reload = reloadToHome } = {}) {
  events?.clear()
  clearShownTopics()
  await settle?.()
  events?.clear()
  await events?.settled()
  try {
    // Lo último, pegado al DELETE: el juego pausa su guardado (sigue en pantalla, no sube nada) y se espera lo que ya
    // iba en vuelo, para que nada llegue después y recree al usuario.
    await Promise.allSettled([game?.settle()])
    await ordersSettled()
    await forget(userId())
  } catch (error) {
    game?.resume() // el servidor sigue con su perfil: el juego vuelve a guardar (su estado actual, una vez)
    throw error
  }
  wipe(localStorage)
  wipe(sessionStorage)
  clearSession()
  events?.clear()
  profile?.reset()
  game?.forget()
  await renewSession().catch(() => {})
  reload()
}

/** `forgetAll` con los contextos de eventos y del juego ya puestos. */
export function useForgetAll() {
  const events = useEvents()
  const game = useGame()
  return (options) => forgetAll({ events, game, ...options })
}
