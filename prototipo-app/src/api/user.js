// Id seudónimo de este navegador, compartido por quienes hablan con la API (eventos, chat, pedidos, «Para ti»).
// Los ayudantes de almacenamiento también los usa la sesión de EventsContext.

const USER_KEY = 'rappi-proto-user'

// randomUUID solo existe en contexto seguro (https o localhost): abierta por la IP de la red (iPhone) no está, y el
// respaldo con la hora daba ids adivinables. getRandomValues sí funciona por http.
export function randomId(prefix) {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8))
  return `${prefix}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

export function readStore(storage, key) {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

export function writeStore(storage, key, value) {
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
