import { useEffect, useRef, useState } from 'react'
import AddButton from '../AddButton'
import HScroll from '../HScroll'
import { pressable } from '../pressable'

const CHARS_PER_SECOND = 70
const TICK_MS = 30

/** Texto que aparece letra por letra, como si el asistente lo estuviera escribiendo. */
function StreamText({ text, animate, onDone }) {
  const [count, setCount] = useState(animate ? 0 : text.length)
  const finished = useRef(!animate)
  const startedAt = useRef(null)
  // En una ref para que un render del padre no reinicie el temporizador.
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    if (finished.current) return undefined
    if (count >= text.length) {
      finished.current = true
      onDoneRef.current?.()
      return undefined
    }
    // El avance sale del tiempo transcurrido: si el navegador atrasa los ticks, el texto no se hace más lento.
    startedAt.current ??= performance.now()
    const timer = setTimeout(() => {
      const elapsed = performance.now() - startedAt.current
      setCount(Math.max(count + 1, Math.floor((elapsed / 1000) * CHARS_PER_SECOND)))
    }, TICK_MS)
    return () => clearTimeout(timer)
  }, [count, text])

  return <>{text.slice(0, count)}</>
}

/** Un mensaje del chat: burbuja del usuario (texto o foto) o respuesta del asistente con tarjetas. */
export default function ChatMessage({ message, onStreamDone, onOpenProduct, onOpenStore, onAction }) {
  const [revealed, setRevealed] = useState(!message.animate)

  if (message.from === 'user') {
    return (
      <div className="chat-row is-user">
        <div className="chat-bubble is-user">
          {message.image && <img className="chat-photo" src={message.image} alt="Foto enviada" />}
          {message.text}
        </div>
      </div>
    )
  }

  if (message.typing) {
    return (
      <div className="chat-row">
        <div className="chat-bubble chat-typing" aria-label="Escribiendo">
          <span />
          <span />
          <span />
        </div>
      </div>
    )
  }

  const done = () => {
    setRevealed(true)
    onStreamDone?.()
  }

  return (
    <div className="chat-row">
      <div className="chat-bot">
        <div className="chat-bubble">
          <StreamText text={message.text} animate={message.animate} onDone={done} />
        </div>
        {revealed && (
          <div className="chat-extras">
            {message.reason && <p className="chat-reason">{message.reason}</p>}
            {message.products?.length > 0 && (
              <HScroll className="chat-products">
                {message.products.map((product, i) => (
                  <div
                    key={product.id}
                    className="chat-product tap"
                    style={{ animationDelay: `${i * 60}ms` }}
                    {...pressable(() => onOpenProduct(product))}
                  >
                    <span className="chat-product-media">
                      <img src={product.img} alt="" draggable="false" />
                      <AddButton product={product} className="add-button--chat" />
                    </span>
                    <span className="chat-product-name">{product.name}</span>
                    <span className="chat-product-price">
                      <b>{product.price}</b>
                      {product.discount && <span>{product.discount}</span>}
                    </span>
                    <span className="chat-product-store">{product.store}</span>
                  </div>
                ))}
              </HScroll>
            )}
            {message.stores?.length > 0 && (
              <div className="chat-stores">
                {message.stores.map((store, i) => (
                  <button
                    key={store.name}
                    type="button"
                    className="chat-store tap"
                    style={{ animationDelay: `${120 + i * 60}ms` }}
                    onClick={() => onOpenStore(store)}
                  >
                    <img src={store.img} alt="" className={store.logo ? 'is-logo' : undefined} />
                    <span>
                      <strong>{store.name}</strong>
                      {store.eta && <small>{store.eta}</small>}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {message.actions?.map((action) => (
              <button key={action.label} type="button" className="chat-action tap" onClick={() => onAction(action)}>
                {action.label} →
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
