import { useState } from 'react'
import Carousel, { Dots } from '../../components/Carousel'
import HScroll from '../../components/HScroll'
import { useToast } from '../../components/Toast'
import { ChevronRight } from '../../components/Icons'
import turboRestaurantesTitle from '../../assets/turbo-restaurantes-title.webp'
import { RestaurantCard, StoreTile } from './StoreCards'
import {
  LOWER_FEES,
  MAIN_TILES,
  NEARBY_STORES,
  PROMOS,
  PROMO_START_INDEX,
  SHORTCUTS,
  TURBO_RESTAURANTS,
} from '../../data/home'
import './home.css'

// Secciones de la Home que comparten «Rappi hoy» y el prototipo final.

/** Restaurantes y Turbo. */
export function MainTiles({ push }) {
  return (
    <section className="home-tiles">
      {MAIN_TILES.map((tile) => (
        <button
          key={tile.id}
          type="button"
          className={`home-tile home-tile--${tile.id} tap`}
          onClick={() => push(tile.screen)}
        >
          <img src={tile.img} alt="" />
          <span>{tile.label}</span>
        </button>
      ))}
    </section>
  )
}

/** Fila de verticales. `proposal`: RappiFavor (no disponible hoy) sí abre, como en el prototipo final. */
export function Shortcuts({ push, proposal = false }) {
  const toast = useToast()
  return (
    <HScroll className="home-shortcuts">
      {SHORTCUTS.map((item) => {
        const enabled = proposal && item.proposalRoute
        const unavailable = item.unavailable && !enabled
        const route = enabled ? item.proposalRoute : item.route
        return (
          <button
            key={item.id}
            type="button"
            className={unavailable ? 'home-shortcut is-unavailable tap' : 'home-shortcut tap'}
            aria-label={unavailable ? `${item.label} (no disponible)` : undefined}
            onClick={() => {
              if (unavailable) toast(`${item.label} no está disponible`)
              else if (route) push(...route)
              else toast()
            }}
          >
            {enabled ? (
              <i className="home-shortcut-emoji" aria-hidden="true">
                {item.emoji}
              </i>
            ) : (
              <img src={item.img} alt="" draggable="false" loading="lazy" />
            )}
            {!unavailable && <span>{item.label}</span>}
          </button>
        )
      })}
    </HScroll>
  )
}

/** Carrusel de promociones con sus puntos (paginan con el carrusel). */
export function Promos({ push, autoplayMs = 4500 }) {
  const toast = useToast()
  const [index, setIndex] = useState(PROMO_START_INDEX)
  return (
    <>
      <Carousel
        className="home-promos"
        initialIndex={PROMO_START_INDEX}
        autoplayMs={autoplayMs}
        onIndexChange={setIndex}
      >
        {PROMOS.map((promo) => (
          <button
            key={promo.id}
            type="button"
            className={`home-promo home-promo--${promo.fit}`}
            aria-label={promo.label}
            onClick={() => (promo.route ? push(...promo.route) : toast())}
          >
            <img src={promo.img} alt="" draggable="false" loading="lazy" />
          </button>
        ))}
      </Carousel>
      <Dots count={PROMOS.length} active={index} className="dots--wide home-promo-dots" />
    </>
  )
}

export function TurboRestaurants({ push }) {
  return (
    <>
      <img
        className="home-turbo-title"
        src={turboRestaurantesTitle}
        alt="En minutos · Turbo Restaurantes"
        loading="lazy"
      />
      <HScroll className="home-cards">
        {TURBO_RESTAURANTS.map((store) => (
          <RestaurantCard key={store.id} store={store} onClick={() => push('store', { store })} />
        ))}
      </HScroll>
    </>
  )
}

export function NearbyStores({ push }) {
  const toast = useToast()
  return (
    <section className="home-nearby">
      <div className="home-section-head">
        <h2 className="section-title">Stores near by you</h2>
        <button type="button" className="chevron-button tap" aria-label="Ver todas" onClick={() => toast()}>
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="home-store-grid">
        {NEARBY_STORES.map((store) => (
          <StoreTile
            key={store.id}
            store={store}
            onClick={() =>
              push('store', {
                store: { ...store, eta: store.when, etaIcon: store.scheduled ? 'clock' : 'bolt', logo: true },
              })
            }
          />
        ))}
      </div>
    </section>
  )
}

export function LowerFees({ push }) {
  return (
    <>
      <h2 className="section-title home-lower-title">Now with lower fees</h2>
      <HScroll className="home-cards home-cards--lower">
        {LOWER_FEES.map((store) => (
          <RestaurantCard key={store.id} store={store} onClick={() => push('store', { store })} />
        ))}
      </HScroll>
    </>
  )
}
