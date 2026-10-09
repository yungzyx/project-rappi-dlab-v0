// Para los tests de render: una API falsa que responde con las respuestas guardadas en src/fixtures.
import { act, cleanup, render } from '@testing-library/react'
import { vi } from 'vitest'
import { retryConnection } from '../lib/api.js'

const fixtures = import.meta.glob('../fixtures/*.json', { eager: true, import: 'default' })

function fixtureFor(url) {
  const { pathname, searchParams } = new URL(url)
  const name = pathname.replace('/analytics/', '')
  const key = name === 'catalog' ? 'catalog' : `${name}.${searchParams.get('source')}`
  return fixtures[`../fixtures/${key}.json`]
}

/** La API "responde" con los fixtures (camino en vivo, sin red). */
export function serveFixtures() {
  retryConnection()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const body = fixtureFor(url)
      return { ok: Boolean(body), status: body ? 200 : 404, json: async () => body ?? {} }
    }),
  )
}

/** La API está caída: el panel debe caer a los datos guardados. */
export function apiDown() {
  retryConnection()
  vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
}

/**
 * Render que espera los datos: con use() de React 19 hay que esperar el act para que el componente
 * suspendido se reanude cuando la promesa resuelve.
 */
export async function renderWithData(ui) {
  let result
  await act(async () => {
    result = render(ui)
  })
  return result
}

export function resetApi() {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
}
