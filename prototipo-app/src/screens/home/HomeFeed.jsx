import { useEffect, useRef } from 'react'
import BackToTop from '../../components/BackToTop'
import ForYouRow from '../../components/assistant/ForYouRow'
import SmartBar from '../../components/assistant/SmartBar'
import PlainSearchBar from '../../components/PlainSearchBar'
import { ChevronDown } from '../../components/Icons'
import { useScrollState } from '../../hooks/useScrollState'
import { useAddress } from '../../state/AddressContext'
import { useDemo } from '../../state/DemoContext'
import { useProfile } from '../../state/ProfileContext'
import { forYou } from '../../assistant/brain'
import { conceptOf } from '../../api/orders'
import { firstShowing, useRemoteForYou } from '../../api/useRemoteForYou'
import { noteShownTopic, useEvents } from '../../state/EventsContext'
import CreditsBanner from './CreditsBanner'
import { LowerFees, MainTiles, NearbyStores, Promos, Shortcuts, TurboRestaurants } from './HomeSections'
import { CREDITS } from '../../data/home'
import './home.css'

// A partir de cuánto scroll aparece el encabezado compacto, y desde dónde se ofrece "Back to top" al subir.
const COLLAPSE_AT_PX = 150
const BACK_TO_TOP_FROM_PX = 600

export default function HomeFeed({ push }) {
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

  const scrollToTop = () => screenRef.current.scrollTo({ top: 0, behavior: 'smooth' })

  return (
    <>
      <header className={isCollapsed ? 'home-compact is-visible' : 'home-compact'} inert={!isCollapsed}>
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

        <MainTiles push={push} />
        <Shortcuts push={push} proposal={demo.isProposal} />
        <Promos push={push} />
        <TurboRestaurants push={push} />

        {demo.isProposal && (
          <ForYouRow
            title="Para ti"
            reason={picks.reason ?? 'Las ofertas más fuertes de hoy'}
            products={picks.products}
            push={push}
          />
        )}

        <NearbyStores push={push} />
        <LowerFees push={push} />
      </div>
    </>
  )
}
