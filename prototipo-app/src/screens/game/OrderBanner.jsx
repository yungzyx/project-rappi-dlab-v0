import { useEffect, useState } from 'react'
import Mascot from '../../components/assistant/Mascot'
import { useOrders } from '../../state/OrdersContext'
import { STEPS, minutesLeft, stepAt } from '../tracking/progress'

const TICK_MS = 500

/**
 * Franja sobre la ronda que se juega mientras llega un pedido: cuánto falta (con los mismos cálculos del seguimiento) y,
 * cuando llega, un botón para verlo. Sin pedido (borrado o de otra sesión), no se muestra.
 */
export default function OrderBanner({ orderId, onOpenOrder }) {
  const order = useOrders().find(orderId)
  const [now, setNow] = useState(() => Date.now())
  const seconds = order ? (now - order.placedAt) / 1000 : 0
  const delivered = stepAt(seconds) === STEPS.length - 1

  useEffect(() => {
    if (!order || delivered) return undefined
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [order, delivered])

  if (!order) return null
  return (
    <div className={delivered ? 'game-order is-delivered' : 'game-order'} role="status">
      {delivered ? (
        <>
          <Mascot size={28} badge mood="jump" />
          <span>¡Tu pedido llegó! 🎉</span>
          <button type="button" onClick={onOpenOrder}>
            Ver pedido
          </button>
        </>
      ) : (
        <span>🛵 Tu pedido llega en {minutesLeft(seconds)} min</span>
      )}
    </div>
  )
}
