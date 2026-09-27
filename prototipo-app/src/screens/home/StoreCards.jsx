import { BoltIcon, ClockIcon, CrownIcon, ScooterIcon, SpeedBoltIcon, StarIcon } from '../../components/Icons'
import './home.css'

const ETA_ICONS = {
  turbo: (size) => <SpeedBoltIcon size={size} className="featured-bolt" />,
  bolt: (size) => <BoltIcon size={size} className="featured-bolt featured-bolt--plain" />,
  clock: (size) => <ClockIcon size={size} />,
  none: () => null,
}

export function EtaIcon({ kind, size = 16 }) {
  return (ETA_ICONS[kind] ?? ETA_ICONS.none)(size)
}

/** Separa los datos de la línea de metadatos con un punto gris, como en la app. */
function joinWithDots(parts) {
  return parts.filter(Boolean).flatMap((part, i) => (i === 0 ? [part] : [<span key={`sep-${i}`} className="meta-sep">•</span>, part]))
}

/**
 * Tarjeta ancha de restaurante o tienda (Home, Deals, Favorites).
 * Campos opcionales: rating, deliveryLabel (píldora amarilla), fee (costo de envío), distance, partial.
 */
export function RestaurantCard({ store, onClick }) {
  return (
    <button type="button" className="featured-card tap" onClick={onClick}>
      <span className={store.partial ? 'featured-media is-partial' : 'featured-media'}>
        <img src={store.img} alt="" draggable="false" />
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

/** Línea "⚡ 12 min • FREE SHIPPING • 1.4 km" de tarjetas y página de tienda. */
export function StoreMeta({ store, className = '' }) {
  const iconKind = store.etaIcon ?? (store.turbo ? 'turbo' : 'bolt')
  const meta = joinWithDots([
    <span key="eta" className="featured-eta">
      <EtaIcon kind={iconKind} />
      {store.eta}
    </span>,
    store.deliveryLabel && (
      <span key="pill" className="free-delivery">
        <CrownIcon size={13} />
        {store.deliveryLabel}
      </span>
    ),
    store.fee && (
      <span key="fee" className="featured-eta">
        <ScooterIcon size={16} />
        {store.fee}
      </span>
    ),
    store.distance && <span key="dist">{store.distance}</span>,
  ])

  return <span className={`featured-meta ${className}`}>{meta}</span>
}

/** Logo de tienda + nombre + horario, para la grilla "Stores near by you". */
export function StoreTile({ store, onClick }) {
  const Icon = store.scheduled ? ClockIcon : BoltIcon
  return (
    <button type="button" className="store-tile tap" onClick={onClick}>
      <img src={store.img} alt="" />
      <span className="store-name">{store.name}</span>
      <span className="store-when">
        <Icon size={15} className={store.scheduled ? 'store-icon' : 'store-icon store-icon--bolt'} />
        <span>{store.when}</span>
      </span>
    </button>
  )
}
