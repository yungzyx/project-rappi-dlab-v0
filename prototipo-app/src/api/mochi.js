// Ofertas de Mochi de rappi-ia: `POST /mochi/offer` (un momento de la app) y `GET /mochi/plans` (ocasiones).
import { request, toPrototypeProduct } from './client'

const OFFER_TIMEOUT_MS = 5_000

/**
 * La oferta de Mochi para un momento (`carrito`, `checkout`, `sin_resultado`, `proximo_pedido`, `plan`,
 * `vertical_por_probar`) con su contexto, o `null` si no tiene nada que ofrecer (204): entonces Mochi no dice nada.
 * Devuelve `{ moment, text, products, vertical, backendVertical, reason, actions }`; la `vertical` es la de la app y
 * cada producto lleva `fromSuggestion` y `suggestionOrigin: 'mochi-<momento>'` para los eventos y el pedido.
 * Si falla, lanza el `ApiError`: quien llama decide callar.
 */
export async function offer(moment, context = {}, { userId } = {}) {
  const response = await request('/mochi/offer', {
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
      suggestionOrigin: `mochi-${moment}`,
    })),
    vertical: response.prototype_vertical ?? null,
    backendVertical: response.vertical,
    reason: response.reason,
    actions: response.actions ?? [],
  }
}

/** Las ocasiones que Mochi sabe armar: `[{ id, name, emoji }]`. */
export const plans = () => request('/mochi/plans', { timeout: OFFER_TIMEOUT_MS })
