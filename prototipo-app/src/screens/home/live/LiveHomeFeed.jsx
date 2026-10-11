import { useCallback, useEffect, useRef, useState } from 'react'
import { offer, plans as fetchPlans } from '../../../api/agent'
import { noteShown } from '../../../api/suggestions'
import { userId } from '../../../api/user'
import DemoDisclaimer from '../../../components/DemoDisclaimer'
import SmartBar from '../../../components/assistant/SmartBar'
import { useToast } from '../../../components/Toast'
import { ChevronDown } from '../../../components/Icons'
import { VERTICAL_NAMES, routeForScreen } from '../../../data/verticals'
import { useReducedMotion } from '../../../hooks/useReducedMotion'
import { useScrollState } from '../../../hooks/useScrollState'
import { useAddress } from '../../../state/AddressContext'
import { useAddToCart } from '../../../hooks/useAddToCart'
import { useEvents } from '../../../state/EventsContext'
import { useProfile } from '../../../state/ProfileContext'
import CreditsBanner from '../CreditsBanner'
import {
  BestRated,
  FastRestaurants,
  MainTiles,
  NearbyStores,
  Promos,
  Shortcuts,
  useHomeCatalog,
} from '../HomeSections'
import { CREDITS } from '../../../data/home'
import '../home.css'
import LiveAgent from './LiveAgent'
import { Passport, PlanBlock, STAMP_EMOJI, openItem } from './LiveBlocks'
import { REPLAY_EVENT, markTourSeen, session, tourSeen } from '../../../state/liveMemory'
import { isHushed, isQuiet, noteDismissed } from '../../../state/agentQuiet'
import { stampedVerticals, today } from '../../../game/progress.js'
import { NEVER_PUSHED, PASSPORT_GOAL, PASSPORT_ORDER } from '../../../game/verticals.js'
import { useGame } from '../../../state/GameContext'
import './live.css'

// Las secciones de la Home de hoy, con el pasaporte justo bajo los accesos. El agente no sugiere productos aquí.
const ORDER = ['essentials', 'passport', 'promos', 'turbo', 'plan', 'nearby', 'lower']
const T = { enter: 900, greet: 3400, greetHold: 6000, notice: 500 }
// Silenciado por hoy (desde el agente flotante) o callado porque lo ignoraron: no habla por su cuenta; si lo tocan, sí.
const silent = () => isQuiet(today()) || isHushed()

// Guía de la primera vez, tras el saludo: el buscador, el pasaporte y «Jugar». Se ve una vez («Repetir escena» la repite).
const TOUR = [
  { text: 'Arriba está mi buscador: búscame lo que quieras o pídeme ideas 🔎', at: 'essentials', gesture: 'point' },
  { text: 'Este es tu pasaporte: cada vertical nueva que pruebas te da un sello 🎟️', at: 'passport', gesture: 'point' },
  { text: 'Toca «Jugar» y gana sellos jugando rondas cortas ✨', at: 'passport', gesture: 'hop' },
]

const GREETING = '¡Hola! Ahora vivo en tu Home 👋 Prueba verticales nuevas y junta sellos en tu pasaporte.'

const HOME_PLANS = 5 // la Home muestra solo los primeros planes del servidor (once, carrete, asado, panorama, regalo)

const ACTIONS_HOLD = 12000 // un globo con botones se va solo después de esto (no queda tapando la Home)

/** Un toque de vibración en los momentos clave (solo donde el navegador lo permite, como Android). */
const buzz = () => navigator.vibrate?.(12)

/**
 * Home del prototipo final: la barra abre el buscador con el agente. El agente de cuerpo entero vive en
 * la Home sin reordenarla: saluda, acompaña el pasaporte y el plan del día, y al tocarlo invita a una vertical nueva.
 */
export default function LiveHomeFeed({ push, active = true }) {
  const toast = useToast()
  const address = useAddress()
  const catalog = useHomeCatalog()
  const { add: addToCart } = useAddToCart()
  const profile = useProfile()
  const events = useEvents()
  const reduceMotion = useReducedMotion()
  const [replays, setReplays] = useState(0)

  const game = useGame()
  // Sin el progreso del servidor cargado los sellos no son los de la persona: nada se calcula ni se envía con ellos.
  const gameReady = game.status === 'ready'
  // Los temporizadores y la guía llaman a funciones de un render anterior: leen el juego de ahora, no el de entonces.
  const gameRef = useRef(game)
  useEffect(() => {
    gameRef.current = game
  })
  const [freshStamp, setFreshStamp] = useState(() => session.newStamp)
  const [plans, setPlans] = useState([]) // las ocasiones que el agente sabe armar (GET /agent/plans)
  const [plan, setPlan] = useState(() => session.plan?.id ?? null) // la ocasión elegida
  const [kit, setKit] = useState(() => session.plan?.kit ?? null) // sus productos (la oferta `plan`); null mientras llega
  const [kitReason, setKitReason] = useState(() => session.plan?.reason ?? null) // por qué ese kit (`reason` de la oferta)
  const [kitAdded, setKitAdded] = useState(null) // plan cuyo kit ya está en el carro
  const [say, setSay] = useState(null)
  const [target, setTarget] = useState(null) // id del bloque donde se para el agente
  const [present, setPresent] = useState(() => session.played) // aún no entra a escena
  const [entering, setEntering] = useState(false)

  const screenRef = useRef(null)
  const agentRef = useRef(null)
  const blockRefs = useRef(new Map())
  const timers = useRef([])
  const hideTimer = useRef(null)
  const run = useRef(0) // cambia al repetir la escena o al salir: lo que estaba esperando ya no sigue
  const planRun = useRef(0) // cambia en cada ocasión elegida: el kit de una anterior ya no vale
  const poking = useRef(false) // ya se pidió la vertical por probar: otro toque no pide otra
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

  // El globo a la vista y si es de la guía de la primera vez (se leen en timers y efectos, no en el render).
  const said = useRef(null)
  const touring = useRef(false)
  const holdFor = useRef(0) // cuánto dura el globo actual (0: se queda hasta que algo lo reemplace)

  /** Esconde el globo en `ms`. */
  const armHide = useCallback((ms) => {
    hideTimer.current = setTimeout(() => {
      said.current = null
      setSay(null)
      setTarget(null)
    }, ms)
  }, [])

  /** El agente dice algo (o se calla con `null`); con `holdMs` el globo se va solo. Cada frase reemplaza a la anterior. */
  const speak = useCallback((next, at = null, holdMs = 0) => {
    // Cualquier otro globo que reemplace a la guía la termina: queda vista y no vuelve.
    if (touring.current && !next?.tour) {
      touring.current = false
      markTourSeen()
    }
    if (next?.tour) touring.current = true
    said.current = next
    holdFor.current = next && holdMs ? holdMs : 0
    clearTimeout(hideTimer.current)
    setSay(next)
    setTarget(at)
    if (holdFor.current) armHide(holdFor.current)
  }, [armHide])

  /** Mientras se lee el «¿Por qué?» del globo no se va solo; al cerrarlo vuelve a contar desde cero. */
  const onWhyToggle = useCallback((open) => {
    clearTimeout(hideTimer.current)
    if (!open && said.current && holdFor.current) armHide(holdFor.current)
  }, [armHide])

  const getBlock = useCallback((id) => blockRefs.current.get(id) ?? null, [])
  const setRef = (id) => (element) => {
    if (element) blockRefs.current.set(id, element)
    else blockRefs.current.delete(id)
  }

  const visit = useCallback(
    (vertical, route) => {
      // Abrir la vertical en la app la sella (Explorador): el agente lo celebra al volver.
      if (game.visit(vertical)) session.newStamp = vertical
      push(...(route ?? routeForScreen(vertical)))
    },
    [game, push],
  )

  // La guía: cada paso espera a que la persona siga; «Saltar» o «Listo» la terminan para siempre (speak la marca
  // vista) y entonces el agente muestra lo que quedó pendiente de «al volver».
  const endTour = () => {
    speak(null)
    welcomeBack()
  }
  const showTour = (step) => {
    const last = step === TOUR.length - 1
    speak(
      {
        tour: true,
        text: TOUR[step].text,
        mood: 'wave',
        gesture: TOUR[step].gesture,
        actions: last
          ? [{ label: 'Listo', onClick: endTour }]
          : [
              { label: 'Siguiente', onClick: () => showTour(step + 1) },
              { label: 'Saltar', onClick: endTour },
            ],
      },
      TOUR[step].at,
    )
  }

  const openFromBlock = (product) => {
    if (product.vertical && game.visit(product.vertical)) session.newStamp = product.vertical
    openItem(product, push)
  }

  // Primera vez en la Home: entra y saluda. No sugiere nada ni mueve la Home.
  useEffect(() => {
    if (session.played) return undefined
    clearTimers()
    later(reduceMotion ? 0 : T.enter, () => {
      setPresent(true)
      setEntering(true)
      if (!silent()) speak({ text: GREETING, mood: 'wave', gesture: 'greet' }, null, T.greetHold)
    })
    later((reduceMotion ? 0 : T.enter) + T.greet, () => {
      setEntering(false)
      session.played = true
    })
    // Cuando el saludo termina, la primera vez: la guía (en silencio, no; ni encima de algo que la persona pidió).
    later((reduceMotion ? 0 : T.enter) + T.greetHold, () => {
      const free = !said.current || said.current.text === GREETING
      if (free && !silent() && !tourSeen()) showTour(0)
    })
    return clearTimers
    // Solo al montar (o al repetir la escena).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replays])

  // Lo último que se agregó al carro lo comenta la oferta `carrito` de la API; sin oferta (204) o si falla, no dice nada.
  async function commentOn(added) {
    if (added.entityId == null) return
    const mine = run.current
    let made = null
    try {
      made = await offer(
        'carrito',
        { product: { entity_type: added.entityType, entity_id: added.entityId } },
        { userId: userId() },
      )
    } catch {
      return
    }
    // Se fue de la Home, repitió la escena, lo silenciaron mientras tanto o ya empezó la guía: ya no es el momento.
    if (!made || mine !== run.current || silent() || touring.current) return
    noteShown(events.track, made.products, {
      origin: `agent-${made.moment}`,
      concept: made.reason?.concept,
      generation: profile.resets,
    })
    const see = made.actions.find((action) => action.route)
    speak(
      {
        text: made.text,
        why: made.reason,
        mood: 'wave',
        actions: [
          ...(see ? [{ label: see.label, onClick: () => visit(made.vertical, see.route) }] : []),
          {
            label: 'Ahora no',
            onClick: () => {
              noteDismissed()
              speak(null)
            },
          },
        ],
      },
      null,
      ACTIONS_HOLD,
    )
  }

  // Al volver a la Home: celebra un sello nuevo o comenta lo último que se agregó al carro. La Home queda montada bajo
  // las pantallas que se abren encima (`active` es si está arriba), así que corre cada vez que vuelve a estar arriba;
  // durante la guía espera, y corre al terminarla.
  function welcomeBack() {
    // Lo pendiente se borra de la sesión recién cuando el agente habla: en desarrollo, StrictMode monta dos veces y la
    // primera vez se cancelan los timers.
    if (silent()) {
      // En silencio el sello igual se marca en el pasaporte, sin globo.
      session.newStamp = null
      session.lastAdded = null
      later(1800, () => setFreshStamp(null))
    } else if (session.newStamp) {
      const now = gameRef.current
      if (now.status !== 'ready') return // «te faltan N» necesita los sellos de verdad: espera a que el juego cargue
      const stamps = stampedVerticals(now.state)
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
      later(T.notice, () => (session.lastAdded = null))
      commentOn(added)
    }
  }
  // Con otra pantalla encima, lo que Mochi esperaba (una oferta, un kit) ya no corresponde: se calla y no habla después.
  // La guía no: sigue donde quedó cuando la Home vuelve a estar arriba.
  useEffect(() => {
    if (active) return
    run.current += 1
    if (!touring.current) speak(null)
  }, [active, speak])

  useEffect(() => {
    if (!active || !session.played || touring.current) return
    welcomeBack()
    // Solo al volver a estar arriba (y al montar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // Un sello nuevo que llegó antes de que el juego cargara se celebra cuando carga (solo ese cambio de estado).
  const wasGameReady = useRef(gameReady)
  useEffect(() => {
    const justLoaded = gameReady && !wasGameReady.current
    wasGameReady.current = gameReady
    if (!justLoaded || !active || !session.played || touring.current || !session.newStamp) return
    welcomeBack()
    // Solo reacciona a que el juego termine de cargar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameReady])

  // Las ocasiones del plan del día salen de la API; sin ellas el bloque no ofrece nada (no hay kits locales).
  useEffect(() => {
    let current = true
    fetchPlans().then(
      (list) => current && setPlans(list.slice(0, HOME_PLANS)),
      () => {},
    )
    return () => {
      current = false
    }
  }, [])

  // Cuando el plan del día entra en pantalla, el agente camina hasta él (una vez por sesión).
  const hasPlans = plans.length > 0
  useEffect(() => {
    const element = blockRefs.current.get('plan')
    if (!hasPlans || !element || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || session.planPrompted || !session.played || silent() || touring.current) return
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
  }, [speak, hasPlans])

  // «Repetir la escena» desde fuera del teléfono.
  useEffect(() => {
    const replay = () => {
      run.current += 1
      clearTimers()
      planRun.current += 1
      setFreshStamp(null)
      setPlan(null)
      setKit(null)
      setKitReason(null)
      setKitAdded(null)
      setPresent(false)
      speak(null)
      screenRef.current?.scrollTo({ top: 0 })
      setReplays((n) => n + 1)
    }
    window.addEventListener(REPLAY_EVENT, replay)
    return () => window.removeEventListener(REPLAY_EVENT, replay)
  }, [clearTimers, speak])

  // Tocar una ocasión pide su kit a la API. Sin kit (204 o sin red) la ocasión no queda elegida y el agente no dice nada.
  const pickPlan = async (id) => {
    const chosen = plans.find((option) => option.id === id)
    const mine = (planRun.current += 1)
    session.plan = null
    setPlan(id)
    setKit(null)
    setKitReason(null)
    setKitAdded(null)
    let made = null
    try {
      made = await offer('plan', { occasion: id }, { userId: userId() })
    } catch {
      // Sin respuesta: queda como estaba.
    }
    if (mine !== planRun.current) return // eligió otra ocasión (o repitió la escena) mientras llegaba
    if (!made?.products.length) {
      setPlan(null)
      return
    }
    // Cada producto del kit es una sugerencia mostrada, con su propio concepto.
    for (const product of made.products)
      noteShown(events.track, [product], { origin: `agent-${made.moment}`, generation: profile.resets })
    session.plan = { id, kit: made.products, reason: made.reason } // la Home vuelve a montarse al cambiar de pestaña: el kit sigue ahí
    setKit(made.products)
    setKitReason(made.reason)
    speak({ text: `${chosen.emoji} ${made.text}`, mood: 'wave', gesture: 'hop' }, 'plan', 4500)
  }

  // Igual que el «+» de cada producto: al carro, al perfil y a los eventos del panel (una aceptación por producto).
  const addKit = () => {
    for (const product of kit) addToCart(product)
    setKitAdded(plan)
    buzz()
    toast(`Agregaste ${kit.length} productos del kit`)
    speak({ text: '¡Listo! Llega todo junto 🛵 Ve tu carro abajo.', mood: 'wave', gesture: 'spin' }, 'plan', 3500)
  }

  // Tocar al agente: la API propone la primera vertical sin sello (con los sellos del juego en el contexto).
  const poke = async () => {
    // Mientras saluda, tocarlo no cambia de tema.
    if (!session.played || poking.current || gameRef.current.status !== 'ready') return
    const stamps = stampedVerticals(gameRef.current.state)
    poking.current = true
    const mine = run.current
    let made = null
    try {
      made = await offer('vertical_por_probar', { stamped: stamps }, { userId: userId() })
    } catch {
      // Sin respuesta, el agente no dice nada.
    } finally {
      poking.current = false
    }
    if (mine !== run.current) return
    if (!made) {
      // Sin nada que proponer: si el pasaporte no tiene más que Farmacia (la salud no se empuja), lo celebra.
      if (!PASSPORT_ORDER.some((v) => !stamps.includes(v) && !NEVER_PUSHED.has(v)))
        speak(
          { text: '¡Ya probaste de todo! Eres oficialmente multivertical 🏆', mood: 'wave', gesture: 'spin' },
          null,
          3500,
        )
      return
    }
    noteShown(events.track, made.products, { origin: `agent-${made.moment}`, generation: profile.resets })
    const name = VERTICAL_NAMES[made.vertical] ?? made.backendVertical
    const left = PASSPORT_GOAL - stamps.length
    speak(
      {
        text: `¿Y si pruebas ${name} ${STAMP_EMOJI[made.backendVertical] ?? ''}? Juega una ronda y te llevas su sello.${left > 0 ? ` Te ${left === 1 ? 'falta 1' : `faltan ${left}`} para el envío gratis.` : ''}`,
        why: made.reason,
        mood: 'wave',
        gesture: 'hop',
        actions: [
          { label: `Jugar ${name}`, onClick: () => push('game', { round: made.backendVertical }) },
          { label: `Abrir ${name}`, onClick: () => visit(made.vertical) },
          {
            label: 'Después',
            onClick: () => {
              noteDismissed()
              speak(null)
            },
          },
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
        status={game.status}
        onRetry={game.retry}
        fresh={freshStamp}
        onOpenGame={(tab) => push('game', { tab })}
        onOpenStamp={(vertical) => push('game', { vertical })}
      />
    ),
    promos: <Promos push={push} />,
    turbo: <FastRestaurants stores={catalog.fastRestaurants} push={push} />,
    plan: (
      <PlanBlock
        plans={plans}
        plan={plan}
        kit={kit}
        kitReason={kitReason}
        added={kitAdded === plan}
        onPick={pickPlan}
        onOpen={openFromBlock}
        onAddKit={addKit}
        onCheckout={() => push('checkout')}
      />
    ),
    nearby: <NearbyStores stores={catalog.nearbyStores} push={push} />,
    lower: <BestRated stores={catalog.bestRated} push={push} />,
  }

  return (
    <>
      <div
        ref={screenRef}
        className="screen home home--live"
        onScroll={(event) => {
          onScroll(event)
          agentRef.current?.scrolled()
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
        <DemoDisclaimer />

        <div className="live-blocks">
          {ORDER.map((id) => (
            <div key={id} ref={setRef(id)} className={`live-block live-block--${id}`}>
              {blocks[id]}
            </div>
          ))}
        </div>
      </div>

      <LiveAgent
        ref={agentRef}
        say={say}
        target={target}
        getBlock={getBlock}
        entering={entering}
        away={!present || !active}
        reduceMotion={reduceMotion}
        onPoke={poke}
        onWhyToggle={onWhyToggle}
      />
    </>
  )
}
