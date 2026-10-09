import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SmartBar from '../../../components/assistant/SmartBar'
import { useToast } from '../../../components/Toast'
import { ChevronDown } from '../../../components/Icons'
import { TAGS, tagsOf } from '../../../assistant/tags'
import { VERTICAL_NAMES, routeForScreen } from '../../../data/verticals'
import { useScrollState } from '../../../hooks/useScrollState'
import { useAddress } from '../../../state/AddressContext'
import { useAddToCart } from '../../../hooks/useAddToCart'
import { useProfile } from '../../../state/ProfileContext'
import CreditsBanner from '../CreditsBanner'
import { LowerFees, MainTiles, NearbyStores, Promos, Shortcuts, TurboRestaurants } from '../HomeSections'
import { CREDITS } from '../../../data/home'
import '../home.css'
import LiveBigotes from './LiveBigotes'
import { Passport, PlanBlock, STAMP_EMOJI, openItem } from './LiveBlocks'
import { REPLAY_EVENT, session } from '../../../state/liveMemory'
import { DATA } from '../../../game/data.js'
import { stampedVerticals } from '../../../game/progress.js'
import { GAME_TO_SCREEN, NEVER_PUSHED, PASSPORT_GOAL } from '../../../game/verticals.js'
import { useGame } from '../../../state/GameContext'
import { PLANS, discoveryFor, planKit } from './script'
import './live.css'

// Las secciones de la Home de hoy, con el pasaporte justo bajo los accesos. Mochi no sugiere productos aquí.
const ORDER = ['essentials', 'passport', 'promos', 'turbo', 'plan', 'nearby', 'lower']
const T = { enter: 900, greet: 3400, greetHold: 6000, notice: 500 }
const GREETING = '¡Hola! Ahora vivo en tu Home 👋 Prueba verticales nuevas y junta sellos en tu pasaporte.'

const ACTIONS_HOLD = 12000 // un globo con botones se va solo después de esto (no queda tapando la Home)

/** Un toque de vibración en los momentos clave (solo donde el navegador lo permite, como Android). */
const buzz = () => navigator.vibrate?.(12)

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
 * Home del prototipo final: sin ícono de chat; la barra abre el buscador con Mochi. Mochi de cuerpo entero vive en
 * la Home sin reordenarla: saluda, acompaña el pasaporte y el plan del día, y al tocarlo invita a una vertical nueva.
 */
export default function LiveHomeFeed({ push, active = true }) {
  const toast = useToast()
  const address = useAddress()
  const { add: addToCart } = useAddToCart()
  const profile = useProfile()
  const reduceMotion = usePrefersReducedMotion()
  const [replays, setReplays] = useState(0)

  const game = useGame()
  const stamps = stampedVerticals(game.state) // ids del juego
  const [freshStamp, setFreshStamp] = useState(() => session.newStamp)
  const [plan, setPlan] = useState(() => session.plan)
  const [kitAdded, setKitAdded] = useState(null) // plan cuyo kit ya está en el carro
  const [say, setSay] = useState(null)
  const [target, setTarget] = useState(null) // id del bloque donde se para Mochi
  const [present, setPresent] = useState(() => session.played) // aún no entra a escena
  const [entering, setEntering] = useState(false)
  const kit = useMemo(() => (plan ? planKit(plan) : []), [plan])

  const screenRef = useRef(null)
  const bigotesRef = useRef(null)
  const blockRefs = useRef(new Map())
  const timers = useRef([])
  const hideTimer = useRef(null)
  const run = useRef(0) // cambia al repetir la escena o al salir: lo que estaba esperando ya no sigue
  const [{ scrolled }, onScroll] = useScrollState()

  const later = useCallback((ms, fn) => timers.current.push(setTimeout(fn, ms)), [])
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])
  useEffect(
    () => () => {
      run.current += 1
      clearTimers()
      clearTimeout(hideTimer.current)
    },
    [clearTimers],
  )

  /** Mochi dice algo (o se calla con `null`); con `holdMs` el globo se va solo. Cada frase reemplaza a la anterior. */
  const speak = useCallback((next, at = null, holdMs = 0) => {
    clearTimeout(hideTimer.current)
    setSay(next)
    setTarget(at)
    if (next && holdMs)
      hideTimer.current = setTimeout(() => {
        setSay(null)
        setTarget(null)
      }, holdMs)
  }, [])

  const getBlock = useCallback((id) => blockRefs.current.get(id) ?? null, [])
  const setRef = (id) => (element) => {
    if (element) blockRefs.current.set(id, element)
    else blockRefs.current.delete(id)
  }

  const visit = useCallback(
    (vertical, route) => {
      // Abrir la vertical en la app la sella (Explorador): Mochi lo celebra al volver.
      if (game.visit(vertical)) session.newStamp = vertical
      push(...(route ?? routeForScreen(vertical)))
    },
    [game, push],
  )

  const openFromBlock = (item) => {
    if (item.vertical && game.visit(item.vertical)) session.newStamp = item.vertical
    openItem(item, push)
  }

  // Primera vez en la Home: entra y saluda. No sugiere nada ni mueve la Home.
  useEffect(() => {
    if (session.played) return undefined
    clearTimers()
    later(reduceMotion ? 0 : T.enter, () => {
      setPresent(true)
      setEntering(true)
      speak({ text: GREETING, mood: 'wave', gesture: 'greet' }, null, T.greetHold)
    })
    later((reduceMotion ? 0 : T.enter) + T.greet, () => {
      setEntering(false)
      session.played = true
    })
    return clearTimers
    // Solo al montar (o al repetir la escena).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replays])

  // Al volver a la Home: celebra un sello nuevo o comenta lo último que se agregó al carro. La Home queda montada bajo
  // las pantallas que se abren encima (`active` es si está arriba), así que corre cada vez que vuelve a estar arriba.
  useEffect(() => {
    if (!active || !session.played) return
    // Lo pendiente se borra de la sesión recién cuando Mochi habla: en desarrollo, StrictMode monta dos veces y la
    // primera vez se cancelan los timers.
    if (session.newStamp) {
      const name = VERTICAL_NAMES[session.newStamp]
      const left = Math.max(PASSPORT_GOAL - stamps.length, 0)
      later(T.notice, () => {
        session.newStamp = null
        buzz()
        speak(
          {
            text: left
              ? `¡Sello nuevo de ${name}! 🎉 Te ${left === 1 ? 'falta 1' : `faltan ${left}`} para el envío gratis.`
              : `¡Sello de ${name}! 🎉 Desbloqueaste el envío gratis.`,
            mood: 'jump',
            gesture: 'spin',
          },
          null,
          4200,
        )
      })
      later(1800, () => setFreshStamp(null))
    } else if (session.lastAdded) {
      const added = session.lastAdded
      const tag = tagsOf(`${added.name} ${added.store ?? ''}`).find((candidate) => TAGS[candidate])
      const pairing = tag ? discoveryFor({ tag, vertical: added.vertical }) : null
      later(T.notice, () => (session.lastAdded = null))
      if (pairing) {
        later(T.notice, () =>
          speak(
            {
              text: `Vi que agregaste ${added.name.split(' ').slice(0, 3).join(' ')}. Con eso combina ${pairing.label.toLowerCase()} ${pairing.emoji}, en ${pairing.verticalName}.`,
              mood: 'wave',
              actions: [
                { label: `Ver ${pairing.verticalName}`, onClick: () => visit(pairing.vertical) },
                { label: 'Ahora no', onClick: () => speak(null) },
              ],
            },
            null,
            ACTIONS_HOLD,
          ),
        )
      }
    }
    // Solo al volver a estar arriba (y al montar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // Cuando el plan del día entra en pantalla, Mochi camina hasta él (una vez por sesión).
  useEffect(() => {
    const element = blockRefs.current.get('plan')
    if (!element || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || session.planPrompted || !session.played) return
        session.planPrompted = true
        speak(
          {
            text: '¿Qué plan tienes hoy? Elige uno y armo todo, de las tiendas que hagan falta 👇',
            mood: 'wave',
            gesture: 'point',
          },
          'plan',
          5000,
        )
      },
      { threshold: 0.6 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [speak])

  // «Repetir la escena» desde fuera del teléfono.
  useEffect(() => {
    const replay = () => {
      run.current += 1
      clearTimers()
      setFreshStamp(null)
      setPlan(null)
      setKitAdded(null)
      setPresent(false)
      speak(null)
      screenRef.current?.scrollTo({ top: 0 })
      setReplays((n) => n + 1)
    }
    window.addEventListener(REPLAY_EVENT, replay)
    return () => window.removeEventListener(REPLAY_EVENT, replay)
  }, [clearTimers, speak])

  const pickPlan = (id) => {
    const chosen = PLANS.find((option) => option.id === id)
    session.plan = id
    setPlan(id)
    profile.trackTags(chosen.tags, 1)
    const next = planKit(id)
    const verticals = new Set(next.map((item) => item.vertical)).size
    speak(
      {
        text: `${chosen.emoji} ${chosen.line} ${next.length} cosas de ${verticals} verticales.`,
        mood: 'wave',
        gesture: 'hop',
      },
      'plan',
      4500,
    )
  }

  // Igual que el «+» de cada producto: al carro, al perfil y a los eventos del panel.
  const addKit = () => {
    const products = kit.filter((item) => item.kind === 'product').map((item) => item.product)
    for (const product of products) addToCart(product)
    setKitAdded(plan)
    buzz()
    toast(`Agregaste ${products.length} productos del kit`)
    speak({ text: '¡Listo! Llega todo junto 🛵 Ve tu carro abajo.', mood: 'wave', gesture: 'spin' }, 'plan', 3500)
  }

  const poke = () => {
    // Mientras saluda, tocarlo no cambia de tema.
    if (!session.played) return
    // La primera vertical sin sello del pasaporte; Farmacia nunca (la salud no se empuja).
    const missing = DATA.order.find((v) => !stamps.includes(v) && !NEVER_PUSHED.has(v))
    if (!missing) {
      speak(
        { text: '¡Ya probaste de todo! Eres oficialmente multivertical 🏆', mood: 'wave', gesture: 'spin' },
        null,
        3500,
      )
      return
    }
    const name = VERTICAL_NAMES[GAME_TO_SCREEN[missing]]
    const left = PASSPORT_GOAL - stamps.length
    speak(
      {
        text: `¿Y si pruebas ${name} ${STAMP_EMOJI[missing]}? Juega una ronda y te llevas su sello.${left > 0 ? ` Te ${left === 1 ? 'falta 1' : `faltan ${left}`} para el envío gratis.` : ''}`,
        mood: 'wave',
        gesture: 'hop',
        actions: [
          { label: `Jugar ${name}`, onClick: () => push('game', { round: missing }) },
          { label: `Abrir ${name}`, onClick: () => visit(GAME_TO_SCREEN[missing]) },
          { label: 'Después', onClick: () => speak(null) },
        ],
      },
      null,
      ACTIONS_HOLD,
    )
  }

  const blocks = {
    essentials: (
      <>
        <MainTiles push={push} />
        <Shortcuts push={push} proposal />
      </>
    ),
    passport: (
      <Passport
        state={game.state}
        fresh={freshStamp}
        onOpenGame={(tab) => push('game', { tab })}
        onOpenStamp={(vertical) => push('game', { vertical })}
      />
    ),
    promos: <Promos push={push} />,
    turbo: <TurboRestaurants push={push} />,
    plan: (
      <PlanBlock
        plan={plan}
        kit={kit}
        added={kitAdded === plan}
        onPick={pickPlan}
        onOpen={openFromBlock}
        onAddKit={addKit}
        onCheckout={() => push('checkout')}
      />
    ),
    nearby: <NearbyStores push={push} />,
    lower: <LowerFees push={push} />,
  }

  return (
    <>
      <div
        ref={screenRef}
        className="screen home home--live"
        onScroll={(event) => {
          onScroll(event)
          bigotesRef.current?.scrolled()
        }}
        data-top={scrolled ? 'scrolled' : 'top'}
      >
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
          <SmartBar />
          <CreditsBanner credits={CREDITS} onClick={() => push('vertical', { id: 'pharmacy' })} />
        </section>

        <div className="live-blocks">
          {ORDER.map((id) => (
            <div key={id} ref={setRef(id)} className={`live-block live-block--${id}`}>
              {blocks[id]}
            </div>
          ))}
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
