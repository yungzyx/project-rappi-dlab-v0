// Ayudantes para los tests que hablan con la API (no se importan desde la app).
// Las respuestas de ejemplo de src/api/fixtures/ las escriben los tests del backend (`make contract` en rappi-ia).

import { vi } from 'vitest'

const FIXTURES = import.meta.glob('./fixtures/*.json', { eager: true })

/** JSON de `src/api/fixtures/<name>.json` (una copia: cada test puede modificar la suya). */
export function fixture(name) {
  const module = FIXTURES[`./fixtures/${name}.json`]
  if (!module) throw new Error(`No existe la respuesta de ejemplo «${name}» en src/api/fixtures/`)
  return structuredClone(module.default)
}

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Un `slow:<ms>` responde la fixture con el nombre del primer tramo de la ruta (`/health` → `health`), o `{}` si no hay. */
function slowBody(pathname) {
  try {
    return fixture(pathname.split('/')[1])
  } catch {
    return {}
  }
}

function respond(route, { pathname, signal }) {
  if (route === undefined) return Promise.resolve(json(404, { detail: 'Not Found' }))
  if (route === 'offline') return Promise.reject(new TypeError('Failed to fetch'))
  if (typeof route === 'number') return Promise.resolve(json(route, { detail: `HTTP ${route}` }))
  if (typeof route === 'string' && route.startsWith('slow:')) {
    const delay = Number(route.slice('slow:'.length))
    return new Promise((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer)
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort)
        resolve(json(200, slowBody(pathname)))
      }, delay)
      if (signal?.aborted) abort()
      else signal?.addEventListener('abort', abort, { once: true })
    })
  }
  return Promise.resolve(json(200, route))
}

/**
 * Reemplaza `fetch` por respuestas de ejemplo. Las claves son 'GET /health' o '/health' (sin método es GET) y se
 * comparan con la ruta sin la query. El valor puede ser:
 * - un objeto: se responde 200 con ese JSON;
 * - un número: se responde ese estado;
 * - 'offline': el fetch falla, como sin red;
 * - 'slow:<ms>': responde la fixture de la ruta pasados esos ms (se rinde si la petición se aborta).
 * Lo que no está en `routes` responde 404. Devuelve el mock de `fetch` para revisar las llamadas.
 */
export function stubApi(routes) {
  const table = new Map(
    Object.entries(routes).map(([key, route]) => {
      const [, method = 'GET', path] = key.match(/^(?:([A-Z]+)\s+)?(\/.*)$/) ?? []
      return [`${method} ${path}`, route]
    }),
  )
  const fetchMock = vi.fn((url, { method = 'GET', signal } = {}) => {
    const { pathname } = new URL(url)
    return respond(table.get(`${method.toUpperCase()} ${pathname}`), { pathname, signal })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
