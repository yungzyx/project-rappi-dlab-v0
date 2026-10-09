import { useEffect, useState } from 'react'
import BackButton from '../../components/BackButton'
import Sheet from '../../components/Sheet'
import { useToast } from '../../components/Toast'
import { StarIcon } from '../../components/Icons'
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
export default function TrackingScreen({ back, reset, params }) {
  const orders = useOrders()
  const order = orders.find(params.orderId)
  const [now, setNow] = useState(() => Date.now())

  const seconds = order ? (now - order.placedAt) / 1000 : 0
  const step = stepAt(seconds)
  const delivered = step === STEPS.length - 1

  // El reloj avanza hasta la entrega: después ya no hay nada que mover.
  useEffect(() => {
    if (delivered) return undefined
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [delivered])

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

  return (
    <div className="screen tracking">
      <div className="tracking-map-wrap">
        <TrackingMap progress={rideProgress(seconds)} delivered={delivered} />
        <BackButton className="tracking-back" onClick={back} />
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

        {delivered && (
          <button type="button" className="tracking-home-button tap" onClick={reset}>
            Volver al inicio
          </button>
        )}
      </section>
    </div>
  )
}

// Conversación fija con el Rappitendero (el prototipo no tiene chat en vivo).
const COURIER_CHAT = [
  { from: 'courier', text: 'Hola, ya tengo tu pedido y voy en camino 🛵' },
  { from: 'user', text: 'Gracias. Si no contesto el timbre, llámame.' },
  { from: 'courier', text: 'Perfecto, llego en unos minutos.' },
]

function Courier() {
  const [chatOpen, setChatOpen] = useState(false)
  return (
    <div className="tracking-courier">
      <span className="tracking-avatar">CR</span>
      <span className="tracking-courier-text">
        <strong>Carlos R.</strong>
        <small>
          Your Rappitendero · <StarIcon filled size={12} /> 4.9
        </small>
      </span>
      <button type="button" className="tracking-contact tap" aria-label="Contactar" onClick={() => setChatOpen(true)}>
        <HeadsetIcon size={20} />
      </button>
      <Sheet open={chatOpen} onClose={() => setChatOpen(false)} title="Chat con Carlos R.">
        <ul className="tracking-chat">
          {COURIER_CHAT.map((line, i) => (
            <li key={i} className={line.from === 'user' ? 'tracking-chat-line is-user' : 'tracking-chat-line'}>
              {line.text}
            </li>
          ))}
        </ul>
        <p className="tracking-chat-note">Carlos R. está conduciendo: responde cuando pueda.</p>
      </Sheet>
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
      {demo.isProposal && !demo.isLive && next && (
        <button
          type="button"
          className="tracking-next tap"
          onClick={() => assistant.open({ query: next.label })}
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
