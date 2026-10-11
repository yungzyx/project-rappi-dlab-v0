// Ofertas del agente de rappi-ia: `POST /agent/offer` (un momento de la app) y `GET /agent/plans` (ocasiones).
import { routeForScreen } from '../data/verticals'
import { request, toPrototypeProduct } from './client'
import { userId } from './user'

const OFFER_TIMEOUT_MS = 5_000

/** La acción del servidor trae la vertical de la app (`route: ['express']`); aquí pasa a la ruta de su pantalla. */
function toAction({ route, ...action }) {
  return route?.[0] ? { ...action, route: routeForScreen(route[0]) } : action
}

/**
 * La oferta del agente para un momento (`carrito`, `checkout`, `sin_resultado`, `proximo_pedido`, `plan`,
 * `vertical_por_probar`) con su contexto, o `null` si no tiene nada que ofrecer (204): entonces el agente no dice nada.
 * Devuelve `{ moment, text, products, vertical, backendVertical, reason, actions }`; la `vertical` es la de la app y
 * cada producto lleva `fromSuggestion` y `suggestionOrigin: 'agent-<momento>'` para los eventos y el pedido, y cada
 * acción la `route` de la app (`push(...route)`).
 * Si falla, lanza el `ApiError`: quien llama decide callar.
 */
export async function offer(moment, context = {}, { userId } = {}) {
  const response = await request('/agent/offer', {
    method: 'POST',
    body: { moment, ...(userId ? { user_id: userId } : {}), context },
    timeout: OFFER_TIMEOUT_MS,
  })
  if (!response) return null
  return {
    moment: response.moment,
    text: response.text,
    products: response.products.map((p) => ({
      ...toPrototypeProduct(p),
      fromSuggestion: true,
      suggestionOrigin: `agent-${moment}`,
    })),
    vertical: response.prototype_vertical ?? null,
    backendVertical: response.vertical,
    reason: response.reason,
    actions: (response.actions ?? []).map(toAction),
  }
}

/**
 * Las ocasiones que el agente sabe armar para esta persona: `[{ id, name, emoji, reason? }]`. Las que su historia
 * pone primero traen `reason: { text, basis }` («Para ti»); sin historia, la lista de siempre y sin `reason`.
 */
export const plans = () => request(`/agent/plans?user_id=${encodeURIComponent(userId())}`, { timeout: OFFER_TIMEOUT_MS })
