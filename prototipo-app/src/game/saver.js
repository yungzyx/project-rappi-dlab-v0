/**
 * Guarda el progreso de a una petición: mientras una va en vuelo, los estados que llegan se reducen al último, que
 * sale cuando la anterior termina. Si una falla, ese estado queda pendiente y se reenvía con el próximo `save`
 * (el progreso nunca se pierde en pantalla: lo que se envía es siempre el estado más nuevo).
 * `send(state)` devuelve una promesa; `save` devuelve otra que termina cuando no queda nada por enviar (o falló).
 */
export function createSaver(send) {
  let latest
  let queued = false
  let running = null

  async function drain() {
    try {
      while (queued) {
        const state = latest
        queued = false
        try {
          await (async () => send(state))() // un `send` que lance en seco también cuenta como fallo, y siempre cede un turno
        } catch {
          queued = true // el próximo save lo reenvía junto con su estado más nuevo
          return
        }
      }
    } finally {
      running = null // en seco, sin esperar un turno: un save que llegue ahora arranca otra tanda
    }
  }

  return {
    save(state) {
      latest = state
      queued = true
      running ??= drain()
      return running
    },
    /** ¿Hay algo sin confirmar por el servidor (en vuelo o pendiente tras un fallo)? */
    pending: () => queued || running !== null,
  }
}
