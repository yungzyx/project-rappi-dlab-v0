import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Carousel, { Dots } from '../../../components/Carousel'
import HScroll from '../../../components/HScroll'
import PlainSearchBar from '../../../components/PlainSearchBar'
import { useToast } from '../../../components/Toast'
import { ChevronDown, ChevronRight } from '../../../components/Icons'
import { TAGS, tagsOf } from '../../../assistant/tags'
import { VERTICAL_NAMES, routeForScreen } from '../../../data/verticals'
import { useScrollState } from '../../../hooks/useScrollState'
import { useAddress } from '../../../state/AddressContext'
import { useCart } from '../../../state/CartContext'
import { useProfile } from '../../../state/ProfileContext'
import turboRestaurantesTitle from '../../../assets/turbo-restaurantes-title.webp'
import CreditsBanner from '../CreditsBanner'
import { RestaurantCard, StoreTile } from '../StoreCards'
import {
  CREDITS,
  LOWER_FEES,
  MAIN_TILES,
  NEARBY_STORES,
  PROMOS,
  PROMO_START_INDEX,
  SHORTCUTS,
  TURBO_RESTAURANTS,
} from '../data'
import '../home.css'
import LiveBigotes from './LiveBigotes'
import { DiscoveryBlock, InterestBlock, Passport, PlanBlock, openItem, useFlip } from './LiveBlocks'
import { PASSPORT, PASSPORT_GOAL, REPLAY_EVENT, loadPassport, session, stamp } from './memory'
import { PLANS, discoveryFor, interestFor, moveToFront, planKit } from './script'
import './live.css'

// El bloque del interés parte abajo, como en la Home de hoy: Bigotes lo sube justo bajo el buscador.
const BASE_ORDER = ['essentials', 'passport', 'promos', 'turbo', 'plan', 'nearby', 'interest', 'lower']
const T = { enter: 900, greet: 3400, autoAccept: 7000, scroll: 520, land: 1150, revealHold: 7000, notice: 500 }

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function usePrefersReducedMotion() {
  const query = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')
  const [reduce, setReduce] = useState(Boolean(query?.matches))
  useEffect(() => {
    if (!query) return undefined
    const change = () => setReduce(query.matches)
    query.addEventListener?.('change', change)
    return () => query.removeEventListener?.('change', change)
  }, [query])
  return reduce
}

/**
 * Tercer prototipo («Bigotes vivo»): sin ícono de chat. Bigotes de cuerpo entero vive en la Home, se da cuenta de lo
 * que le gusta a la persona, sube ese bloque al primer lugar oscureciendo lo demás y le invita a verticales nuevas.
 */
export default function LiveHomeFeed({ push }) {
  const toast = useToast()
  const address = useAddress()
  const cart = useCart()
  const profile = useProfile()
  const reduceMotion = usePrefersReducedMotion()
  const [replays, setReplays] = useState(0)

  // El interés se decide al entrar: si cambiara mientras se mira la Home, los bloques saltarían solos.
  // `replays` lo recalcula al repetir la escena (para eso se lee el perfil de ese momento).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const interest = useMemo(() => interestFor(profile.top), [replays])
  const discovery = useMemo(() => discoveryFor(interest), [interest])

  const [order, setOrder] = useState(() => session.order ?? BASE_ORDER)
  const [stamps, setStamps] = useState(loadPassport)
  const [freshStamp, setFreshStamp] = useState(() => session.newStamp)
  const [plan, setPlan] = useState(() => session.plan)
  const [scene, setScene] = useState('idle') // idle | spotlight | reveal
  const [say, setSay] = useState(null)
  const [target, setTarget] = useState(null) // id del bloque donde se para Bigotes
  const [present, setPresent] = useState(() => session.played) // aún no entra a escena
  const [entering, setEntering] = useState(false)
  const [sparkle, setSparkle] = useState(false)
  const kit = useMemo(() => (plan ? planKit(plan) : []), [plan])

  const screenRef = useRef(null)
  const bigotesRef = useRef(null)
  const blockRefs = useRef(new Map())
  const timers = useRef([])
  const [{ top }, onScroll] = useScrollState()
  const snapshot = useFlip(blockRefs, order, { focus: 'interest', reduceMotion })

  const later = useCallback((ms, fn) => timers.current.push(setTimeout(fn, ms)), [])
  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  useEffect(() => () => clearTimers(), [])

  const speak = useCallback((next, at = null) => {
    setSay(next)
    setTarget(at)
  }, [])

  const getBlock = useCallback((id) => blockRefs.current.get(id) ?? null, [])
  const setRef = (id) => (element) => {
    if (element) blockRefs.current.set(id, element)
    else blockRefs.current.delete(id)
  }

  const visit = useCallback(
    (vertical, route) => {
      const next = stamp(vertical)
      setStamps(next)
      push(...(route ?? routeForScreen(vertical)))
    },
    [push],
  )

  const openFromBlock = (item) => {
    if (item.vertical) setStamps(stamp(item.vertical))
    openItem(item, push)
  }

  const finishScene = useCallback(() => {
    setScene('idle')
    setSparkle(false)
    speak({ text: 'Listo. Si me tocas, te muestro algo nuevo 😉', mood: 'idle' }, 'interest')
    later(4200, () => speak(null, null))
  }, [later, speak])

  const bringInterestUp = useCallback(async () => {
    session.played = true
    setScene('spotlight')
    speak(
      { text: `¡Voy! Tus ${interest.label.toLowerCase()} ${interest.emoji} van primero.`, mood: 'wave' },
      'interest',
    )
    screenRef.current?.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
    await wait(reduceMotion ? 0 : T.scroll)
    snapshot()
    const next = moveToFront(order, 'interest', discovery ? 'discovery' : null)
    session.order = next
    setOrder(next)
    await wait(reduceMotion ? 0 : T.land)
    setSparkle(true)
    if (!discovery) return finishScene()
    setScene('reveal')
    speak(
      {
        text: `Y para acompañar: ${discovery.label.toLowerCase()} ${discovery.emoji} en ${discovery.verticalName}, donde nunca has pedido. Pruébalo y te llevas un sello.`,
        mood: 'wave',
        actions: [
          { label: `Ver ${discovery.verticalName}`, onClick: () => visit(discovery.vertical) },
          { label: 'Listo', onClick: finishScene },
        ],
      },
      'discovery',
    )
    later(T.revealHold, finishScene)
  }, [discovery, finishScene, interest, later, order, reduceMotion, snapshot, speak, visit])

  const undo = () => {
    snapshot()
    session.order = BASE_ORDER
    setOrder(BASE_ORDER)
    speak({ text: 'Hecho, lo dejé como estaba. Igual lo tengo en cuenta 👍', mood: 'idle' }, null)
    later(3500, () => speak(null, null))
  }

  // Primera vez en la Home: entra, saluda y cuenta lo que notó.
  useEffect(() => {
    if (session.played) return undefined
    clearTimers()
    later(reduceMotion ? 0 : T.enter, () => {
      setPresent(true)
      setEntering(true)
      speak({ text: '¡Hola! Ahora vivo en tu Home 👋 La voy a ordenar a tu gusto.', mood: 'wave' }, null)
    })
    later((reduceMotion ? 0 : T.enter) + T.greet, () => {
      setEntering(false)
      speak(
        {
          text: `Noté que te encantan los ${interest.label.toLowerCase()} ${interest.emoji}. ¿Te los traigo arriba?`,
          mood: 'idle',
          actions: [
            { label: '¡Sí, tráelos!', onClick: () => (clearTimers(), bringInterestUp()) },
            { label: 'Ahora no', onClick: () => (clearTimers(), (session.played = true), speak(null, null)) },
          ],
        },
        null,
      )
      later(T.autoAccept, () => bringInterestUp())
    })
    return clearTimers
    // Solo al montar (o al repetir la escena).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replays])

  // Al volver a la Home: celebra un sello nuevo o comenta lo último que se agregó al carro.
  useEffect(() => {
    if (!session.played) return
    if (session.newStamp) {
      const name = VERTICAL_NAMES[session.newStamp]
      const left = Math.max(PASSPORT_GOAL - loadPassport().length, 0)
      session.newStamp = null
      later(T.notice, () =>
        speak(
          {
            text: left
              ? `¡Sello nuevo de ${name}! 🎉 Te ${left === 1 ? 'falta 1' : `faltan ${left}`} para el envío gratis.`
              : `¡Sello de ${name}! 🎉 Desbloqueaste el envío gratis.`,
            mood: 'wave',
          },
          null,
        ),
      )
      later(T.notice + 4200, () => speak(null, null))
      later(1800, () => setFreshStamp(null))
    } else if (session.lastAdded) {
      const added = session.lastAdded
      session.lastAdded = null
      const tag = tagsOf(`${added.name} ${added.store ?? ''}`).find((candidate) => TAGS[candidate])
      const pairing = tag ? discoveryFor({ tag, vertical: added.vertical }) : null
      if (pairing) {
        later(T.notice, () =>
          speak(
            {
              text: `Vi que agregaste ${added.name.split(' ').slice(0, 3).join(' ')}. Con eso combina ${pairing.label.toLowerCase()} ${pairing.emoji}, en ${pairing.verticalName}.`,
              mood: 'wave',
              actions: [
                { label: `Ver ${pairing.verticalName}`, onClick: () => visit(pairing.vertical) },
                { label: 'Ahora no', onClick: () => speak(null, null) },
              ],
            },
            null,
          ),
        )
      }
    }
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cuando el plan del día entra en pantalla, Bigotes camina hasta él (una vez por sesión).
  useEffect(() => {
    const element = blockRefs.current.get('plan')
    if (!element || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || session.planPrompted || !session.played || scene !== 'idle') return
        session.planPrompted = true
        speak(
          { text: '¿Qué plan tienes hoy? Elige uno y armo todo, de las tiendas que hagan falta 👇', mood: 'wave' },
          'plan',
        )
        later(5000, () => speak(null, null))
      },
      { threshold: 0.6 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [later, scene, speak])

  // «Repetir la escena» desde fuera del teléfono.
  useEffect(() => {
    const replay = () => {
      clearTimers()
      setStamps(loadPassport())
      setFreshStamp(null)
      setPlan(null)
      setScene('idle')
      setSparkle(false)
      setPresent(false)
      speak(null, null)
      setOrder(BASE_ORDER)
      screenRef.current?.scrollTo({ top: 0 })
      setReplays((n) => n + 1)
    }
    window.addEventListener(REPLAY_EVENT, replay)
    return () => window.removeEventListener(REPLAY_EVENT, replay)
  }, [speak])

  const pickPlan = (id) => {
    const chosen = PLANS.find((option) => option.id === id)
    session.plan = id
    setPlan(id)
    profile.trackTags(chosen.tags, 1)
    const next = planKit(id)
    const verticals = new Set(next.map((item) => item.vertical)).size
    speak(
      { text: `${chosen.emoji} ${chosen.line} ${next.length} cosas de ${verticals} verticales.`, mood: 'wave' },
      'plan',
    )
    later(4500, () => speak(null, null))
  }

  const addKit = () => {
    const products = kit.filter((item) => item.kind === 'product')
    products.forEach((item) => cart.add(item.product))
    toast(`Agregaste ${products.length} productos del kit`)
    speak({ text: '¡Listo! Llega todo junto 🛵 Ve tu carro abajo.', mood: 'wave' }, 'plan')
    later(3500, () => speak(null, null))
  }

  const poke = () => {
    if (scene !== 'idle') return
    const missing = PASSPORT.find(({ id }) => !stamps.includes(id) && id !== 'pharmacy')
    if (!missing) {
      speak({ text: '¡Ya probaste de todo! Eres oficialmente multivertical 🏆', mood: 'wave' }, null)
      later(3500, () => speak(null, null))
      return
    }
    const name = VERTICAL_NAMES[missing.id]
    speak(
      {
        text: `¿Y si pruebas ${name} ${missing.emoji}? Es tu sello ${stamps.length + 1} de ${PASSPORT_GOAL} para el envío gratis.`,
        mood: 'wave',
        actions: [
          { label: `Abrir ${name}`, onClick: () => visit(missing.id) },
          { label: 'Después', onClick: () => speak(null, null) },
        ],
      },
      null,
    )
  }

  const dim = scene !== 'idle'
  const focused = scene === 'reveal' ? new Set(['interest', 'discovery']) : new Set(['interest'])
  const dimClass = (id) => (dim && !focused.has(id) ? 'live-dimmable is-dimmed' : 'live-dimmable')

  const blocks = {
    essentials: (
      <>
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
            const unavailable = item.unavailable && !item.proposalRoute
            const route = item.proposalRoute ?? item.route
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
                {item.proposalRoute ? (
                  <i className="home-shortcut-emoji" aria-hidden="true">
                    {item.emoji}
                  </i>
                ) : (
                  <img src={item.img} alt="" draggable="false" />
                )}
                {!unavailable && <span>{item.label}</span>}
              </button>
            )
          })}
        </HScroll>
      </>
    ),
    passport: <Passport stamps={stamps} fresh={freshStamp} onOpen={(id) => visit(id)} />,
    promos: (
      <>
        <Carousel className="home-promos" initialIndex={PROMO_START_INDEX} autoplayMs={dim ? 0 : 4500}>
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
        <Dots count={PROMOS.length} active={PROMO_START_INDEX} className="dots--wide home-promo-dots" />
      </>
    ),
    turbo: (
      <>
        <img className="home-turbo-title" src={turboRestaurantesTitle} alt="En minutos · Turbo Restaurantes" />
        <HScroll className="home-cards">
          {TURBO_RESTAURANTS.map((store) => (
            <RestaurantCard key={store.id} store={store} onClick={() => push('store', { store })} />
          ))}
        </HScroll>
      </>
    ),
    plan: <PlanBlock plan={plan} kit={kit} onPick={pickPlan} onOpen={openFromBlock} onAddKit={addKit} />,
    nearby: (
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
    ),
    interest: (
      <InterestBlock
        interest={interest}
        promoted={order[0] === 'interest' && scene === 'idle'}
        sparkle={sparkle}
        onOpen={openFromBlock}
        onUndo={undo}
      />
    ),
    discovery: discovery && (
      <DiscoveryBlock discovery={discovery} stamped={stamps.includes(discovery.vertical)} onOpen={openFromBlock} />
    ),
    lower: (
      <>
        <h2 className="section-title home-lower-title">Now with lower fees</h2>
        <HScroll className="home-cards home-cards--lower">
          {LOWER_FEES.map((store) => (
            <RestaurantCard key={store.id} store={store} onClick={() => push('store', { store })} />
          ))}
        </HScroll>
      </>
    ),
  }

  return (
    <>
      <div
        ref={screenRef}
        className={dim ? 'screen home home--live is-dim' : 'screen home home--live'}
        onScroll={(event) => {
          onScroll(event)
          bigotesRef.current?.reposition()
        }}
        data-top={top > 0 ? 'scrolled' : 'top'}
      >
        <section className={`home-top ${dimClass('top')}`}>
          <button type="button" className="home-address tap" onClick={address.openSheet}>
            <span className="home-address-line">{address.selected.line}</span>
            <span className="home-address-label">
              {address.selected.label}
              <span className="chevron-chip">
                <ChevronDown size={16} />
              </span>
            </span>
          </button>
          <PlainSearchBar onClick={() => push('search')} />
          <CreditsBanner credits={CREDITS} onClick={() => push('vertical', { id: 'pharmacy' })} />
        </section>

        <div className="live-blocks">
          {order.map((id) =>
            blocks[id] ? (
              <div
                key={id}
                ref={setRef(id)}
                className={`live-block live-block--${id} ${dimClass(id)}${dim && focused.has(id) ? ' is-focus' : ''}`}
              >
                {blocks[id]}
              </div>
            ) : null,
          )}
        </div>
      </div>

      <LiveBigotes
        ref={bigotesRef}
        say={say}
        target={target}
        getBlock={getBlock}
        entering={entering}
        away={!present}
        reduceMotion={reduceMotion}
        onPoke={poke}
      />
    </>
  )
}
