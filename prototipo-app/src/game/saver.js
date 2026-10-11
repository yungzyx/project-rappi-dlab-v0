// Esperas entre un reintento y el siguiente tras un fallo; pasadas las tres, sigue cada 15 s mientras haya algo sin guardar.
const RETRY_DELAYS_MS = [2000, 5000, 15000]

/**
 * Guarda el progreso de a una petición: mientras una va en vuelo, los estados que llegan se reducen al último, que
 * sale cuando la anterior termina. Si una falla, ese estado queda pendiente y se reenvía solo (a los 2, 5 y 15 s, y
 * después cada 15 s), con `retry()` (volvió la red) o con el próximo `save` (lo que se envía es siempre el estado más
 * nuevo: el progreso nunca se pierde en pantalla).
 * `send(state)` devuelve una promesa; `save` devuelve otra que termina cuando no queda nada por enviar (o falló).
 */
export function createSaver(send, { delays = RETRY_DELAYS_MS } = {}) {
  let latest
  let queued = false
  let running = null
  let epoch = 0 // sube con cada `cancel`: un fallo de un envío anterior no deja nada en cola
  let timer = null
  let failures = 0 // fallos seguidos: elige la espera del próximo reintento

  const clearTimer = () => {
    clearTimeout(timer)
    timer = null
  }

  function scheduleRetry() {
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      retry()
    }, delays[Math.min(failures, delays.length) - 1])
  }

  async function drain() {
    const mine = epoch
    try {
      while (queued) {
        const state = latest
        queued = false
        try {
          await (async () => send(state))() // un `send` que lance en seco también cuenta como fallo, y siempre cede un turno
          failures = 0
        } catch {
          queued = mine === epoch // el próximo save lo reenvía junto con su estado más nuevo (salvo tras un `cancel`)
          if (queued) {
            failures++
            scheduleRetry()
          }
          return
        }
      }
    } finally {
      running = null // en seco, sin esperar un turno: un save que llegue ahora arranca otra tanda
    }
  }

  function retry() {
    if (!queued || running) return running ?? Promise.resolve()
    clearTimer()
    running = drain()
    return running
  }

  return {
    save(state) {
      latest = state
      queued = true
      clearTimer() // sale ahora; si falla, se vuelve a programar
      running ??= drain()
      return running
    },
    /** Reenvía ya lo que quedó pendiente (volvió la red o la pestaña). Sin nada pendiente no hace nada. */
    retry,
    /**
     * «Olvidar»: descarta lo que está en cola (y un reenvío pendiente) y termina cuando acaba el envío en vuelo, si lo
     * hay. Después ya no sale nada del progreso anterior; un `save` posterior guarda como siempre.
     */
    async cancel() {
      epoch++
      queued = false
      failures = 0
      clearTimer()
      await running
    },
    /** Deja de reintentar solo (la pantalla se desmonta); lo pendiente sigue pendiente. */
    stop: clearTimer,
    /** ¿Hay algo sin confirmar por el servidor (en vuelo o pendiente tras un fallo)? */
    pending: () => queued || running !== null,
  }
}
