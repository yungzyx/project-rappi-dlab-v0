// Búsqueda híbrida de rappi-ia (`GET /search`), en el formato del prototipo.
import { screenForBackend } from '../data/verticals'
import { request, toPrototypeProduct } from './client'

const SEARCH_TIMEOUT_MS = 8_000

const groupOf = (backendVertical, prototypeVertical, products) => ({
  // El id de la vertical en la app (el mismo de sus pantallas y del carrito); el código del backend va aparte.
  vertical: prototypeVertical ?? screenForBackend(backendVertical) ?? backendVertical,
  backendVertical,
  products: products.map(toPrototypeProduct),
})

/**
 * Busca `q` en el catálogo: `{ query, groups: [{ vertical, backendVertical, products }], unmet, unmetReason }`
 * (`query`: lo que se buscó, para saber a qué texto pertenece una respuesta).
 * - Sin `vertical`, busca en las verticales que corresponden a la consulta (más `current`, la de la pantalla) y
 *   devuelve un grupo por vertical, en el orden de la API. `limit` es por grupo.
 * - Con `vertical` (id del prototipo o código del backend), busca solo ahí y devuelve un único grupo.
 * Un mismo producto puede salir en varios grupos con el mismo `id`: las llaves de la lista deben incluir la vertical.
 */
export async function searchAll(q, { vertical, current, limit } = {}) {
  const params = new URLSearchParams({ q })
  if (vertical) params.set('vertical', vertical)
  else if (current) params.set('current', current)
  if (limit) params.set('limit', String(limit))
  const response = await request(`/search?${params}`, { timeout: SEARCH_TIMEOUT_MS })
  const groups = response.groups
    ? response.groups.map((g) => groupOf(g.vertical, g.prototype_vertical, g.products))
    : [groupOf(response.vertical, null, response.products ?? [])]
  return { query: q, groups, unmet: Boolean(response.unmet), unmetReason: response.unmet_reason ?? null }
}
