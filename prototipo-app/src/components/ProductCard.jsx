import { useEffect, useState } from 'react'
import { EtaIcon } from './StoreMeta'
import { MOCHI_DRAG_TYPE, askAbout } from '../assistant/mochiAsk'
import { useLongPress } from '../hooks/useLongPress'
import { useAssistant } from '../state/AssistantContext'
import { useDemo } from '../state/DemoContext'
import AddButton from './AddButton'
import Img from './Img'
import { useProductSheet } from '../state/ProductSheetContext'
import './product-card.css'

const ASK_VISIBLE_MS = 3000

// En escritorio (mouse) la tarjeta también se puede arrastrar hasta Mochi; en el celular, arrastrar es scroll.
const canDrag = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches === true

/** Producto de supermercado/farmacia/botillería (Meat & Seafood, beers, Baby care…). Tocarlo abre su hoja; el "+" va aparte. */
export function ProductCard({ product, onOpenStore }) {
  const sheet = useProductSheet()
  const final = useDemo()?.isFinal === true
  const assistant = useAssistant()
  const [asking, setAsking] = useState(false)
  const press = useLongPress(() => setAsking(true))

  // «Preguntarle a Mochi» se va solo, o al tocar fuera.
  useEffect(() => {
    if (!asking) return undefined
    const timer = setTimeout(() => setAsking(false), ASK_VISIBLE_MS)
    const onPointer = (event) => {
      if (!event.target.closest?.('.product-ask')) setAsking(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [asking])

  // En el prototipo final, mantener presionado (o arrastrar hasta Mochi, en escritorio) es preguntarle por él.
  const mochi = final
    ? {
        ...press.handlers,
        draggable: canDrag(),
        onDragStart: (event) => event.dataTransfer.setData(MOCHI_DRAG_TYPE, JSON.stringify(product)),
      }
    : {}
  const openSheet = () => {
    if (final && press.fired()) return // fue un toque largo
    sheet.open(product, { onOpenStore })
  }

  return (
    <div className="product-card">
      {asking && (
        <button
          type="button"
          className="product-ask tap"
          onClick={() => {
            setAsking(false)
            assistant?.open({ query: askAbout(product) })
          }}
        >
          Preguntarle a Mochi
        </button>
      )}
      <button type="button" className="product-card-main tap" onClick={openSheet} {...mochi}>
      <span className={product.partial ? 'product-media is-partial' : 'product-media'}>
        <Img src={product.img} draggable="false" />
        {product.ageRestricted && (
          <span className="product-age" aria-label="Solo mayores de 18">
            +18
          </span>
        )}
      </span>
      <span className="product-price-row">
        <span className={product.discount ? 'product-price' : 'product-price is-plain'}>{product.price}</span>
        {product.before && <s>{product.before}</s>}
      </span>
      {product.discount && <span className="product-pct">{product.discount}</span>}
      <span className="product-name">{product.name}</span>
      <span className="product-size">{product.size}</span>
      <span className="product-unit">{product.unit}</span>
      <StoreLine item={product} />
      </button>
      <AddButton product={product} className="add-button--grocery" />
    </div>
  )
}

/** Oferta de restaurante (Crazy Deals, Top 10 Pizzas). `boxed` = tarjeta blanca sobre fondo gris. */
export function DealCard({ deal, boxed = false, onClick }) {
  return (
    <div className={boxed ? 'deal-card is-boxed' : 'deal-card'}>
      <button type="button" className="product-card-main tap" onClick={onClick}>
      <span className="deal-media">
        <Img src={deal.img} draggable="false" />
      </span>
      <span className="deal-price">{deal.price}</span>
      <span className="deal-discount">
        <span className="deal-pct">
          {deal.proDiscount && (
            <svg width="15" height="12" viewBox="0 0 24 18" aria-hidden="true">
              <path d="M1 4l5.5 4.5L12 1l5.5 7.5L23 4l-2.5 13h-17z" fill="currentColor" />
            </svg>
          )}
          {deal.discount}
        </span>
        <s>{deal.before}</s>
      </span>
      <span className="deal-name">{deal.name}</span>
      <StoreLine item={deal} />
      </button>
      <AddButton product={deal} className={boxed ? 'add-button--boxed' : 'add-button--deal'} />
    </div>
  )
}

/** Logo de la tienda: imagen recortada o, si no hay, un círculo con la inicial (`storeBadge`). */
export function StoreLogo({ item }) {
  if (item.storeLogo) return <Img src={item.storeLogo} />
  return (
    <span className="store-badge" style={{ background: item.storeBadge ?? '#8b8b8b' }}>
      {item.store.charAt(0)}
    </span>
  )
}

function StoreLine({ item }) {
  return (
    <span className="store-line">
      <StoreLogo item={item} />
      <span>
        <strong>{item.store}</strong>
        <span className="store-line-eta">
          <EtaIcon kind={item.etaIcon} size={15} />
          {item.eta}
        </span>
      </span>
    </span>
  )
}
