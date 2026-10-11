// Estado del prototipo guardado en el navegador (mismo patrón que OrdersContext): en modo privado o sin
// almacenamiento, todo sigue funcionando en memoria.

/** Lee y valida lo guardado; si falta, está corrupto o no pasa `isValid`, devuelve `fallback`. */
export function loadStored(key, isValid, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    const parsed = JSON.parse(raw)
    return isValid(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

export function saveStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Sin almacenamiento: el estado vive solo en memoria.
  }
}

/** Evento de ventana con que «Borrar mis datos» avisa a quienes tienen datos en memoria (los pedidos) que se borró todo. */
export const FORGET_EVENT = 'rappi-proto-olvidar'
