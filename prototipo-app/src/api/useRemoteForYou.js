import { useEffect, useState } from 'react'
import { health, recommendations, toPrototypeProduct } from './client'
import { userId } from './user'

/**
 * "Para ti" de rappi-ia: intereses aprendidos → complemento → productos reales de otro vertical, con precio.
 * Devuelve { row, pending }. `row` es null mientras carga, sin API, si todavía no aprendió nada o si el perfil se
 * borró después de pedirla (`generation` = profile.resets): la pantalla usa el cerebro local. `pending`: todavía se
 * espera la respuesta, así que la fila local es provisoria (no cuenta como mostrada).
 */
// Lo que dura la pestaña: la Home se desmonta al abrir una tienda o cambiar de pestaña, y al volver no hay que pedir
// la fila otra vez ni contarla de nuevo como mostrada.
let cachedRow = null
const shown = new Set()

/**
 * true la primera vez que se muestra esta sugerencia en la pestaña (concepto, vertical, origen y generación del
 * perfil): la misma clave con que AddButton cuenta su aceptación, para que las aceptadas nunca superen a las mostradas.
 */
export function firstShowing(row) {
  const key = `${row.concept}|${row.vertical}|${row.origin}|${row.generation}`
  if (shown.has(key)) return false
  shown.add(key)
  return true
}

export function useRemoteForYou(enabled, generation = 0) {
  const [row, setRow] = useState(() => (cachedRow?.generation === generation ? cachedRow : null))
  const [answered, setAnswered] = useState(false)
  useEffect(() => {
    if (!enabled || row) return undefined
    let alive = true
    ;(async () => {
      try {
        if (!(await health())) return
        const [first] = (await recommendations(userId())).rows
        if (!alive || !first?.products.length) return
        cachedRow = {
          generation,
          reason: first.reason,
          concept: first.concept,
          vertical: first.vertical,
          // Es una sugerencia de Mochi: los pedidos que salgan de aquí no cuentan para aprender afinidad.
          products: first.products.map((p) => ({
            ...toPrototypeProduct(p),
            fromSuggestion: true,
            suggestionOrigin: 'para-ti',
          })),
        }
        setRow(cachedRow)
      } catch {
        // Sin recomendaciones: queda la fila local.
      } finally {
        if (alive) setAnswered(true)
      }
    })()
    return () => {
      alive = false
    }
    // Se pide al entrar a la pantalla. Tras "Olvidar" no se vuelve a pedir aquí: el servidor puede no haber
    // borrado todavía y devolvería lo mismo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])
  return { row: row?.generation === generation ? row : null, pending: enabled && !row && !answered }
}
