import { useEffect, useRef, useState } from 'react'
import AddButton from '../AddButton'
import HScroll from '../HScroll'
import Img from '../Img'
import { useGame } from '../../state/GameContext'
import { useProductSheet } from '../../state/ProductSheetContext'

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
  const sheet = useProductSheet()
  return (
    <HScroll className="agent-msg-products">
      {products.map((product, i) => (
        <div key={product.id} className="agent-msg-product" style={{ animationDelay: `${delay + i * 60}ms` }}>
          <button
            type="button"
            className="agent-msg-product-main tap"
            onClick={() => sheet.open(product, { onOpenStore: () => onOpenProduct(product) })}
          >
            <span className="agent-msg-product-media">
              <Img src={product.img} draggable="false" />
              {product.ageRestricted && (
                <span className="agent-msg-product-age" aria-label="Solo mayores de 18">
                  +18
                </span>
              )}
            </span>
            <span className="agent-msg-product-name">{product.name}</span>
            <span className="agent-msg-product-price">
              <b>{product.price}</b>
              {product.discount && <span>{product.discount}</span>}
            </span>
            <span className="agent-msg-product-store">{product.store}</span>
          </button>
          <AddButton product={product} className="add-button--agent" />
        </div>
      ))}
    </HScroll>
  )
}

/** Logo de la tienda; si no hay (o no carga), su inicial. */
function StoreLogo({ store }) {
  const [broken, setBroken] = useState(false)
  if (!store.logo || broken) return <span className="agent-msg-also-initial">{store.name.trim().charAt(0)}</span>
  return <Img src={store.logo} onError={() => setBroken(true)} />
}

/** "También en": otras verticales con oferta de lo pedido y sus tiendas reales. Cada una abre su vertical. */
function AlsoIn({ alsoIn, onAction }) {
  return (
    <div className="agent-msg-also">
      <p className="agent-msg-reason">
        <span className="agent-msg-suggestion-tag">También en</span> {alsoIn.label} en otras verticales:
      </p>
      <div className="agent-msg-stores">
        {alsoIn.verticals.map((vertical, i) => (
          <button
            key={vertical.label}
            type="button"
            className="agent-msg-store agent-msg-also-vertical tap"
            style={{ animationDelay: `${240 + i * 60}ms` }}
            onClick={() => vertical.route && onAction({ route: vertical.route })}
          >
            <span className="agent-msg-also-logos">
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

/** «¿Sabías que…?»: un dato con su fuente. Mostrarlo lo suma al álbum (una vez por mensaje). */
function DidYouKnow({ fact }) {
  const { discover } = useGame()
  const discoverRef = useRef(discover)
  const counted = useRef(false)
  useEffect(() => {
    discoverRef.current = discover
  }, [discover])
  useEffect(() => {
    // Con StrictMode el efecto corre dos veces: la marca en la ref evita contarlo dos veces.
    if (counted.current) return
    counted.current = true
    discoverRef.current(fact.vertical, fact.id)
  }, [fact.vertical, fact.id])

  return (
    <aside className="agent-msg-fact" aria-label="¿Sabías que…?">
      <span className="agent-msg-suggestion-tag">¿Sabías que…?</span>
      <strong className="agent-msg-fact-title">{fact.title}</strong>
      <p className="agent-msg-fact-text">{fact.text}</p>
      <p className="agent-msg-fact-source">
        Fuente:{' '}
        <a href={fact.source.url} target="_blank" rel="noopener noreferrer">
          {fact.source.title}
        </a>
      </p>
    </aside>
  )
}

/** Una respuesta del agente con tarjetas (lo elegido se muestra aparte, sin burbuja). */
export default function AgentMessage({ message, onStreamDone, onOpenProduct, onOpenStore, onAction, onRetry }) {
  const [revealed, setRevealed] = useState(!message.animate)

  if (message.typing) {
    return (
      <div className="agent-msg-row">
        <div className="agent-msg-bubble agent-msg-typing" aria-label="Escribiendo">
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
    <div className="agent-msg-row">
      <div className="agent-msg-bot">
        <div className="agent-msg-bubble">
          <StreamText text={message.text} animate={message.animate} onDone={done} />
        </div>
        {revealed && (
          <div className="agent-msg-extras">
            {message.reason && <p className="agent-msg-reason">{message.reason}</p>}
            {message.didYouKnow && <DidYouKnow fact={message.didYouKnow} />}
            {message.products?.length > 0 && <ProductCards products={message.products} onOpenProduct={onOpenProduct} />}
            {message.suggestion?.products?.length > 0 && (
              <div className="agent-msg-suggestion">
                <p className="agent-msg-reason">
                  <span className="agent-msg-suggestion-tag">
                    {message.suggestion.verticalLabel ? `De ${message.suggestion.verticalLabel}` : 'De otra tienda'}
                  </span>{' '}
                  {message.suggestion.question} {message.suggestion.reason}
                </p>
                <ProductCards products={message.suggestion.products} onOpenProduct={onOpenProduct} delay={180} />
                {message.suggestion.route && message.suggestion.verticalLabel && (
                  <button
                    type="button"
                    className="agent-msg-action tap"
                    onClick={() => onAction({ route: message.suggestion.route })}
                  >
                    Ver más en {message.suggestion.verticalLabel} →
                  </button>
                )}
              </div>
            )}
            {message.alsoIn?.verticals?.length > 0 && <AlsoIn alsoIn={message.alsoIn} onAction={onAction} />}
            {message.stores?.length > 0 && (
              <div className="agent-msg-stores">
                {message.stores.map((store, i) => (
                  <button
                    key={store.name}
                    type="button"
                    className="agent-msg-store tap"
                    style={{ animationDelay: `${120 + i * 60}ms` }}
                    onClick={() => onOpenStore(store)}
                  >
                    <Img src={store.img} className={store.logo ? 'is-logo' : undefined} />
                    <span>
                      <strong>{store.name}</strong>
                      {store.eta && <small>{store.eta}</small>}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {message.retry && (
              <button type="button" className="agent-msg-action tap" onClick={onRetry}>
                Reintentar
              </button>
            )}
            {message.actions?.map((action) => (
              <button key={action.label} type="button" className="agent-msg-action tap" onClick={() => onAction(action)}>
                {action.label} →
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
