import { EtaIcon } from './StoreMeta'
import AddButton from './AddButton'
import Img from './Img'
import { useProductSheet } from '../state/ProductSheetContext'
import './product-card.css'

/** Producto de supermercado/farmacia/botillería (Meat & Seafood, beers, Baby care…). Tocarlo abre su hoja; el "+" va aparte. */
export function ProductCard({ product, onOpenStore }) {
  const sheet = useProductSheet()
  return (
    <div className="product-card">
      <button type="button" className="product-card-main tap" onClick={() => sheet.open(product, { onOpenStore })}>
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
