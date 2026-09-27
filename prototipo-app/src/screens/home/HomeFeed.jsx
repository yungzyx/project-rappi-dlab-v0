import { useEffect, useRef, useState } from 'react'
import BackToTop from '../../components/BackToTop'
import Carousel, { Dots } from '../../components/Carousel'
import HScroll from '../../components/HScroll'
import HomeMascot from '../../components/assistant/HomeMascot'
import ForYouRow from '../../components/assistant/ForYouRow'
import SmartBar from '../../components/assistant/SmartBar'
import PlainSearchBar from '../../components/PlainSearchBar'
import { useToast } from '../../components/Toast'
import { ChevronDown, ChevronRight } from '../../components/Icons'
import { useScrollState } from '../../hooks/useScrollState'
import { useAddress } from '../../state/AddressContext'
import { useDemo } from '../../state/DemoContext'
import { useProfile } from '../../state/ProfileContext'
import { forYou } from '../../assistant/brain'
import { useRemoteForYou } from '../../api/useRemoteForYou'
import { useEvents } from '../../state/EventsContext'
import turboRestaurantesTitle from '../../assets/turbo-restaurantes-title.webp'
import CreditsBanner from './CreditsBanner'
import { RestaurantCard, StoreTile } from './StoreCards'
import {
  CREDITS,
  LOWER_FEES,
  MAIN_TILES,
  NEARBY_STORES,
  PROMOS,
  PROMO_START_INDEX,
  SHORTCUTS,
  TURBO_RESTAURANTS,
} from './data'
import './home.css'

// A partir de cuánto scroll aparece el encabezado compacto, y desde dónde se ofrece "Back to top" al subir.
const COLLAPSE_AT_PX = 150
const BACK_TO_TOP_FROM_PX = 600

export default function HomeFeed({ push }) {
  const toast = useToast()
  const address = useAddress()
  const demo = useDemo()
  const profile = useProfile()
  const events = useEvents()
  // Con la API, lo que aprendió rappi-ia (productos reales de otro vertical); sin ella, el cerebro local.
  const remote = useRemoteForYou(demo.isProposal, profile.resets)
  const picks = remote ?? forYou(profile)
  useEffect(() => {
    if (remote)
      events.track('suggestion_shown', { concept_id: remote.concept, vertical: remote.vertical, payload: { origen: 'para-ti' } })
  }, [remote, events])
  const openSearch = () => push('search')
  const screenRef = useRef(null)
  const [{ top, goingUp }, onScroll] = useScrollState()
  const [promoIndex, setPromoIndex] = useState(PROMO_START_INDEX)
  const isCollapsed = top > COLLAPSE_AT_PX
  const showBackToTop = goingUp && top > BACK_TO_TOP_FROM_PX

  const scrollToTop = () => screenRef.current.scrollTo({ top: 0, behavior: 'smooth' })
  const openStore = (store) => push('store', { store })

  return (
    <>
      <header className={isCollapsed ? 'home-compact is-visible' : 'home-compact'} aria-hidden={!isCollapsed}>
        <button type="button" className="home-compact-address tap" onClick={address.openSheet}>
          <strong>{address.selected.label}</strong>
          <span>{address.selected.line}</span>
        </button>
        {demo.isProposal ? (
          <SmartBar compact />
        ) : (
          <PlainSearchBar className="search-bar--compact" onClick={openSearch} />
        )}
      </header>

      <BackToTop visible={showBackToTop} onClick={scrollToTop} />

      <div ref={screenRef} className="screen home" onScroll={onScroll}>
        <section className="home-top">
          {demo.isProposal && <HomeMascot />}
          <button type="button" className="home-address tap" onClick={address.openSheet}>
            <span className="home-address-line">{address.selected.line}</span>
            <span className="home-address-label">
              {address.selected.label}
              <span className="chevron-chip">
                <ChevronDown size={16} />
              </span>
            </span>
          </button>
          {demo.isProposal ? <SmartBar /> : <PlainSearchBar onClick={openSearch} />}
          <CreditsBanner credits={CREDITS} onClick={() => push('vertical', { id: 'pharmacy' })} />
        </section>

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

        <HScroll className="home-shortcuts">
          {SHORTCUTS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.unavailable ? 'home-shortcut is-unavailable tap' : 'home-shortcut tap'}
              aria-label={item.unavailable ? `${item.label} (no disponible)` : undefined}
              onClick={() => {
                if (item.unavailable) toast(`${item.label} no está disponible`)
                else if (item.route) push(...item.route)
                else toast()
              }}
            >
              <img src={item.img} alt="" draggable="false" />
              {!item.unavailable && <span>{item.label}</span>}
            </button>
          ))}
        </HScroll>

        <Carousel
          className="home-promos"
          initialIndex={PROMO_START_INDEX}
          autoplayMs={4500}
          onIndexChange={setPromoIndex}
        >
          {PROMOS.map((promo) => (
            <button
              key={promo.id}
              type="button"
              className={`home-promo home-promo--${promo.fit}`}
              onClick={() => (promo.route ? push(...promo.route) : toast())}
            >
              <img src={promo.img} alt="" draggable="false" />
            </button>
          ))}
        </Carousel>
        <Dots count={PROMOS.length} active={promoIndex} className="dots--wide home-promo-dots" />

        <img className="home-turbo-title" src={turboRestaurantesTitle} alt="En minutos · Turbo Restaurantes" />
        <HScroll className="home-cards">
          {TURBO_RESTAURANTS.map((store) => (
            <RestaurantCard key={store.id} store={store} onClick={() => openStore(store)} />
          ))}
        </HScroll>

        {demo.isProposal && (
          <ForYouRow
            title="Para ti"
            reason={picks.reason ?? 'Las ofertas más fuertes de hoy'}
            products={picks.products}
            push={push}
          />
        )}

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
                onClick={() => openStore({ ...store, eta: store.when, etaIcon: store.scheduled ? 'clock' : 'bolt', logo: true })}
              />
            ))}
          </div>
          <Dots count={3} active={0} className="dots--wide home-store-dots" />
        </section>

        <h2 className="section-title home-lower-title">Now with lower fees</h2>
        <HScroll className="home-cards home-cards--lower">
          {LOWER_FEES.map((store) => (
            <RestaurantCard key={store.id} store={store} onClick={() => openStore(store)} />
          ))}
        </HScroll>
      </div>
    </>
  )
}
