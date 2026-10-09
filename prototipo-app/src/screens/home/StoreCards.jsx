import Img from '../../components/Img'
import { BoltIcon, ClockIcon, StarIcon } from '../../components/Icons'
import { StoreMeta } from '../../components/StoreMeta'
import './home.css'

/**
 * Tarjeta ancha de restaurante o tienda (Home, Deals, Favorites).
 * Campos opcionales: rating, deliveryLabel (píldora amarilla), fee (costo de envío), distance, partial.
 */
export function RestaurantCard({ store, onClick }) {
  return (
    <button type="button" className="featured-card tap" onClick={onClick}>
      <span className={store.partial ? 'featured-media is-partial' : 'featured-media'}>
        <Img src={store.img} draggable="false" />
      </span>
      <span className="featured-name">
        <span className="featured-title">{store.name}</span>
        {store.rating && (
          <span className="featured-rating">
            <StarIcon filled size={15} />
            {store.rating}
          </span>
        )}
      </span>
      <StoreMeta store={store} />
    </button>
  )
}

/** Logo de tienda + nombre + horario, para la grilla "Stores near by you". */
export function StoreTile({ store, onClick }) {
  const Icon = store.scheduled ? ClockIcon : BoltIcon
  return (
    <button type="button" className="store-tile tap" onClick={onClick}>
      <Img src={store.img} />
      <span className="store-name">{store.name}</span>
      <span className="store-when">
        <Icon size={15} className={store.scheduled ? 'store-icon' : 'store-icon store-icon--bolt'} />
        <span>{store.when}</span>
      </span>
    </button>
  )
}
