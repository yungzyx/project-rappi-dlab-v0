import { useEffect, useState } from 'react'
import { health, recommendations, toPrototypeProduct } from './client'
import { userId } from '../state/EventsContext'

/**
 * "Para ti" de rappi-ia: intereses aprendidos → complemento → productos reales de otro vertical, con precio.
 * Devuelve null mientras carga, sin API, si todavía no aprendió nada o si el perfil se borró después de pedirla
 * (`generation` = profile.resets): la pantalla usa el cerebro local.
 */
export function useRemoteForYou(enabled, generation = 0) {
  const [row, setRow] = useState(null)
  useEffect(() => {
    if (!enabled) return undefined
    let alive = true
    ;(async () => {
      if (!(await health())) return
      try {
        const [first] = (await recommendations(userId())).rows
        if (!alive || !first?.products.length) return
        setRow({
          generation,
          reason: first.reason,
          concept: first.concept,
          vertical: first.vertical,
          // Es una sugerencia de Bigotes: los pedidos que salgan de aquí no cuentan para aprender afinidad.
          products: first.products.map((p) => ({
            ...toPrototypeProduct(p),
            fromSuggestion: true,
            suggestionOrigin: 'para-ti',
          })),
        })
      } catch {
        // Sin recomendaciones: queda la fila local.
      }
    })()
    return () => {
      alive = false
    }
    // Se pide al entrar a la pantalla. Tras "Olvidar" no se vuelve a pedir aquí: el servidor puede no haber
    // borrado todavía y devolvería lo mismo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])
  return row?.generation === generation ? row : null
}
