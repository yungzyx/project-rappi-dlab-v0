import { useEffect, useState } from 'react'
import { useToast } from '../../components/Toast'
import { ChevronLeft, StarIcon } from '../../components/Icons'
import { HeadsetIcon } from '../../components/LineIcons'
import { COMPLEMENTS, TAGS, tagsOf } from '../../assistant/tags'
import { useAssistant } from '../../state/AssistantContext'
import { formatPrice } from '../../state/CartContext'
import { useDemo } from '../../state/DemoContext'
import { useOrders } from '../../state/OrdersContext'
import TrackingMap from './TrackingMap'
import { STEPS, minutesLeft, rideProgress, stepAt } from './progress'
import './tracking.css'

const TICK_MS = 500
const STARS = [1, 2, 3, 4, 5]

/** Seguimiento del pedido (funcionalidad agregada): pasos que avanzan solos y Bigotes recorriendo el mapa. */
export default function TrackingScreen({ back, params }) {
  const orders = useOrders()
  const order = orders.find(params.orderId)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  if (!order) {
    return (
      <div className="screen tracking">
        <p className="tracking-missing">No encontramos este pedido.</p>
        <button type="button" className="tracking-home-button tap" onClick={back}>
          Volver
        </button>
      </div>
    )
  }

  const seconds = (now - order.placedAt) / 1000
  const step = stepAt(seconds)
  const delivered = step === STEPS.length - 1

  return (
    <div className="screen tracking">
      <div className="tracking-map-wrap">
        <TrackingMap progress={rideProgress(seconds)} delivered={delivered} />
        <button type="button" className="tracking-back tap" aria-label="Volver" onClick={back}>
          <ChevronLeft size={20} />
        </button>
      </div>

      <section className="tracking-sheet">
        <p className="tracking-eta-label">{delivered ? 'Enjoy your order!' : 'Estimated arrival'}</p>
        <h1 className="tracking-eta">{delivered ? 'Delivered 🎉' : `${minutesLeft(seconds)} min`}</h1>

        <ol className="tracking-steps">
          {STEPS.map((item, i) => (
            <li key={item.id} className={i < step || delivered ? 'is-done' : i === step ? 'is-current' : undefined}>
              <span className="tracking-dot" />
              {item.label}
            </li>
          ))}
        </ol>

        {delivered ? <Delivered order={order} /> : <Courier />}

        <OrderSummary order={order} />
      </section>
    </div>
  )
}

function Courier() {
  const toast = useToast()
  return (
    <div className="tracking-courier">
      <span className="tracking-avatar">CR</span>
      <span className="tracking-courier-text">
        <strong>Carlos R.</strong>
        <small>
          Your Rappitendero · <StarIcon filled size={12} /> 4.9
        </small>
      </span>
      <button
        type="button"
        className="tracking-contact tap"
        aria-label="Contactar"
        onClick={() => toast('Chat con el Rappitendero (simulado)')}
      >
        <HeadsetIcon size={20} />
      </button>
    </div>
  )
}

function Delivered({ order }) {
  const toast = useToast()
  const demo = useDemo()
  const assistant = useAssistant()
  const [rating, setRating] = useState(0)
  // Sugerencia cruzada después de la entrega: el complemento de lo que se pidió.
  const tag = order.items.flatMap((item) => tagsOf(item.name)).find((candidate) => COMPLEMENTS[candidate])
  const next = tag && TAGS[COMPLEMENTS[tag][0]]

  const rate = (value) => {
    setRating(value)
    toast('¡Gracias por tu calificación!')
  }

  return (
    <>
      <div className="tracking-rate">
        <p>How was your order?</p>
        <div className="tracking-stars" role="radiogroup" aria-label="Calificación">
          {STARS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} estrellas`}
              className={value <= rating ? 'is-on' : undefined}
              onClick={() => rate(value)}
            >
              <StarIcon filled size={30} />
            </button>
          ))}
        </div>
      </div>
      {demo.isProposal && next && (
        <button
          type="button"
          className="tracking-next tap"
          onClick={() => assistant.open({ mode: 'chat', query: next.label })}
        >
          <span>
            ✨ ¿Y ahora {next.emoji} {next.label.toLowerCase()}?
          </span>
          <small>Bigotes te arma el próximo pedido</small>
        </button>
      )}
    </>
  )
}

function OrderSummary({ order }) {
  return (
    <details className="tracking-summary">
      <summary>Order details · {formatPrice(order.total)}</summary>
      <ul>
        {order.items.map((item, i) => (
          <li key={`${i}-${item.name}`}>
            <span>
              {item.qty} × {item.name}
            </span>
            <b>{item.price}</b>
          </li>
        ))}
      </ul>
      <p>{order.pickup ? 'Pickup at the store' : `Deliver to ${order.address}`}</p>
    </details>
  )
}
