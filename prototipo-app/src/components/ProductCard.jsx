import { EtaIcon } from '../screens/home/StoreCards'
import AddButton from './AddButton'
import './product-card.css'

/** Producto de supermercado/farmacia/botillería (Meat & Seafood, beers, Baby care…). */
export function ProductCard({ product, onClick }) {
  return (
    <div className="product-card tap" role="button" tabIndex={0} onClick={onClick}>
      <span className={product.partial ? 'product-media is-partial' : 'product-media'}>
        <img src={product.img} alt="" draggable="false" />
        <AddButton product={product} className="add-button--grocery" />
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
    </div>
  )
}

/** Oferta de restaurante (Crazy Deals, Top 10 Pizzas). `boxed` = tarjeta blanca sobre fondo gris. */
export function DealCard({ deal, boxed = false, onClick }) {
  return (
    <div className={boxed ? 'deal-card is-boxed tap' : 'deal-card tap'} role="button" tabIndex={0} onClick={onClick}>
      <span className="deal-media">
        <img src={deal.img} alt="" draggable="false" />
        <AddButton product={deal} className={boxed ? 'add-button--boxed' : 'add-button--deal'} />
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
    </div>
  )
}

/** Logo de la tienda: imagen recortada o, si no hay, un círculo con la inicial (`storeBadge`). */
export function StoreLogo({ item }) {
  if (item.storeLogo) return <img src={item.storeLogo} alt="" />
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
