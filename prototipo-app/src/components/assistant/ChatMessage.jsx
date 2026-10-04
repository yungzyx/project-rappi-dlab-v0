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

function ProductCards({ products, onOpenProduct, delay = 0 }) {
  return (
    <HScroll className="chat-products">
      {products.map((product, i) => (
        <div
          key={product.id}
          className="chat-product tap"
          style={{ animationDelay: `${delay + i * 60}ms` }}
          {...pressable(() => onOpenProduct(product))}
        >
          <span className="chat-product-media">
            <img src={product.img} alt="" draggable="false" />
            {product.ageRestricted && (
              <span className="chat-product-age" aria-label="Solo mayores de 18">
                +18
              </span>
            )}
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
  )
}

/** Logo de la tienda; si no hay (o no carga), su inicial. */
function StoreLogo({ store }) {
  const [broken, setBroken] = useState(false)
  if (!store.logo || broken) return <span className="chat-also-initial">{store.name.trim().charAt(0)}</span>
  return <img src={store.logo} alt="" onError={() => setBroken(true)} />
}

/** "También en": otras verticales con oferta de lo pedido y sus tiendas reales. Cada una abre su vertical. */
function AlsoIn({ alsoIn, onAction }) {
  return (
    <div className="chat-also">
      <p className="chat-reason">
        <span className="chat-suggestion-tag">También en</span> {alsoIn.label} en otras verticales:
      </p>
      <div className="chat-stores">
        {alsoIn.verticals.map((vertical, i) => (
          <button
            key={vertical.label}
            type="button"
            className="chat-store chat-also-vertical tap"
            style={{ animationDelay: `${240 + i * 60}ms` }}
            onClick={() => vertical.route && onAction({ route: vertical.route })}
          >
            <span className="chat-also-logos">
              {vertical.stores.map((store) => (
                <StoreLogo key={store.name} store={store} />
              ))}
            </span>
            <span>
              <strong>{vertical.label}</strong>
              <small>
                {vertical.stores.map((store) => store.name).join(' · ')} · {vertical.items.toLocaleString('es-CL')} productos
              </small>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
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
        {message.source === 'local' && (
          <span className="chat-source" title="La API no respondió: contestaron las reglas del prototipo">
            Respuesta local
          </span>
        )}
        {revealed && (
          <div className="chat-extras">
            {message.reason && <p className="chat-reason">{message.reason}</p>}
            {message.products?.length > 0 && <ProductCards products={message.products} onOpenProduct={onOpenProduct} />}
            {message.suggestion?.products?.length > 0 && (
              <div className="chat-suggestion">
                <p className="chat-reason">
                  <span className="chat-suggestion-tag">
                    {message.suggestion.verticalLabel ? `De ${message.suggestion.verticalLabel}` : 'De otra tienda'}
                  </span>{' '}
                  {message.suggestion.question} {message.suggestion.reason}
                </p>
                <ProductCards products={message.suggestion.products} onOpenProduct={onOpenProduct} delay={180} />
                {message.suggestion.route && message.suggestion.verticalLabel && (
                  <button
                    type="button"
                    className="chat-action tap"
                    onClick={() => onAction({ route: message.suggestion.route })}
                  >
                    Ver más en {message.suggestion.verticalLabel} →
                  </button>
                )}
              </div>
            )}
            {message.alsoIn?.verticals?.length > 0 && <AlsoIn alsoIn={message.alsoIn} onAction={onAction} />}
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
