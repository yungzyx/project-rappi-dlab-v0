import { useEffect, useRef, useState } from 'react'
import BackToTop from '../../components/BackToTop'
import Carousel, { Dots } from '../../components/Carousel'
import HScroll from '../../components/HScroll'
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
import { conceptOf } from '../../api/orders'
import { firstShowing, useRemoteForYou } from '../../api/useRemoteForYou'
import { noteShownTopic, useEvents } from '../../state/EventsContext'
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
  const { row: remote, pending } = useRemoteForYou(demo.isProposal, profile.resets)
  const picks = remote ?? forYou(profile)
  useEffect(() => {
    if (!remote) return
    noteShownTopic(remote.concept) // el chat no vuelve a sugerir este tema en la sesión
    if (firstShowing({ ...remote, origin: 'para-ti' }))
      events.track('suggestion_shown', { concept_id: remote.concept, vertical: remote.vertical, payload: { origen: 'para-ti' } })
  }, [remote, events])
  // Sin fila de rappi-ia (sin API, nada aprendido o tras «Olvidar») queda la local, también marcada como sugerencia:
  // cuenta como mostrada una vez por pestaña, por concepto y vertical. Mientras se espera la de rappi-ia, no: lo que se
  // acepte ahí lo registra AddButton.
  const localPairs =
    demo.isProposal && !remote && !pending
      ? [...new Set(picks.products.filter(conceptOf).map((item) => `${conceptOf(item)}|${item.vertical}`))].join(',')
      : ''
  useEffect(() => {
    for (const pair of localPairs ? localPairs.split(',') : []) {
      const [concept, vertical] = pair.split('|')
      if (firstShowing({ concept, vertical, origin: 'para-ti-local', generation: profile.resets }))
        events.track('suggestion_shown', { concept_id: concept, vertical, payload: { origen: 'para-ti-local' } })
    }
  }, [localPairs, profile.resets, events])
  const openSearch = () => push('search')
  const screenRef = useRef(null)
  const [{ collapsed: isCollapsed, showBackToTop }, onScroll] = useScrollState({
    collapseAt: COLLAPSE_AT_PX,
    backToTopFrom: BACK_TO_TOP_FROM_PX,
  })
  const [promoIndex, setPromoIndex] = useState(PROMO_START_INDEX)

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
          {SHORTCUTS.map((item) => {
            const enabled = demo.isProposal && item.proposalRoute // RappiFavor: no disponible hoy, sí en la propuesta
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
              <img src={promo.img} alt="" draggable="false" loading="lazy" />
            </button>
          ))}
        </Carousel>
        <Dots count={PROMOS.length} active={promoIndex} className="dots--wide home-promo-dots" />

        <img className="home-turbo-title" src={turboRestaurantesTitle} alt="En minutos · Turbo Restaurantes" loading="lazy" />
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
