import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AGENT_NAME } from '../../agent/name'
import { storeOfProduct } from '../../api/catalog'
import { ask as askAgent, forget, profile as remoteProfile, recommendations, toMessage } from '../../api/client'
import { offer } from '../../api/agent'
import { ordersSettled } from '../../api/orders'
import { firstShowing, noteShown } from '../../api/suggestions'
import { userId } from '../../api/user'
import { askAbout } from '../../assistant/agentAsk'
import { routeForScreen } from '../../data/verticals'
import { PopularStores, RecentSearches, SearchResults } from '../search/SearchSections'
import { useSearch } from '../search/useSearch'
import { useDemo } from '../../state/DemoContext'
import { clearShownTopics, noteShownTopic, sessionId, shownTopics, useEvents } from '../../state/EventsContext'
import { useAssistant } from '../../state/AssistantContext'
import { useCart } from '../../state/CartContext'
import { useDialog } from '../../hooks/useDialog'
import { useGame } from '../../state/GameContext'
import { useProfile } from '../../state/ProfileContext'
import BackButton from '../BackButton'
import AgentMessage from './AgentMessage'
import DiscoverSection from './DiscoverSection'
import Mascot from './Mascot'
import { SparkleIcon } from './SmartBar'
import '../search/search.css'
import './assistant.css'

const OPEN_MS = 380
const CLOSE_MS = 280
const MIN_TYPING_MS = 450
const FOR_YOU_WAIT_MS = 3000 // lo que el saludo espera «Para ti»; si tarda más, sale sin él

const DISCOVER_ROWS = 3

const GREETING = `¡Hola! Soy ${AGENT_NAME}, tu asistente Rappi 🧡 ¿Qué se te antoja hoy?`
const OFFLINE = 'Sin conexión'
const NOTHING_TO_PAIR = 'No se me ocurre nada para acompañar eso'
const NOTHING_TO_TRY = 'No se me ocurre nada nuevo para probar'
// Las ideas de siempre, como texto fijo: tocar una le pregunta eso al agente.
const CHIPS = ['🍔 ¿Qué almuerzo hoy?', '🍻 Arma un carrete', '🔥 Ofertas de hoy', '🍫 Algo dulce', '🎁 Un regalo']

let nextId = 1

/** Lo que sale de «Para ti» es una sugerencia del agente: agregarlo se cuenta como aceptada y no enseña afinidad. */
const asForYou = (product) => ({ ...product, fromSuggestion: true, suggestionOrigin: 'para-ti' })

/**
 * Buscador con el agente: el buscador de siempre, con lo que el agente sabe de la persona en bloques que se
 * tocan (sin escribir una pregunta) y una invitación a descubrir otras verticales. Siempre montado (para no perder lo que
 * el agente respondió); se muestra al abrirlo.
 */
export default function AssistantPanel({ push, vertical, depth = 1 }) {
  const assistant = useAssistant()
  const profile = useProfile()
  const game = useGame()
  const demo = useDemo()
  const events = useEvents()
  const cart = useCart()
  const [phase, setPhase] = useState('closed')
  const [messages, setMessages] = useState([])
  const [mood, setMood] = useState('idle')
  const [chipRound, setChipRound] = useState(0)
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const timers = useRef([])
  // Preguntas en fila: la siguiente sale cuando la respuesta anterior ya está en pantalla.
  const askQueue = useRef(Promise.resolve())
  const lastTurn = useRef(null) // pedido anterior de la conversación (para los seguimientos)
  const profileGeneration = useRef(0) // sube al "Olvidar": un perfil remoto pedido antes ya no vale
  const [learnedRemote, setLearnedRemote] = useState(null)
  const [forgetting, setForgetting] = useState(false)
  const [discoverRows, setDiscoverRows] = useState([])
  const search = useSearch({ vertical })

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms))
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const addMessage = (message) => setMessages((prev) => [...prev, { id: nextId++, ...message }])

  /**
   * Muestra "escribiendo…" hasta que llega la respuesta de la API, con un mínimo para que se note.
   * Devuelve una promesa que se cumple cuando la respuesta ya está en pantalla.
   */
  const botSays = useCallback((responseOrPromise) => {
    const typingId = nextId++
    const startedAt = Date.now()
    setMood('think')
    setMessages((prev) => [...prev, { id: typingId, from: 'bot', typing: true }])
    return Promise.resolve(responseOrPromise).then(
      (response) =>
        new Promise((shown) => {
          const wait = Math.max(0, MIN_TYPING_MS - (Date.now() - startedAt))
          later(() => {
            setMood('talk')
            // Id nuevo: si reutilizara el del indicador, React conservaría su estado y mostraría las tarjetas antes del texto.
            setMessages((prev) => [
              ...prev.filter((m) => m.id !== typingId),
              { id: nextId++, from: 'bot', animate: true, ...response },
            ])
            setChipRound((r) => r + 1)
            shown()
          }, wait)
        }),
    )
  }, [])

  const apiContext = (extra = {}) => ({
    vertical,
    user_id: userId(),
    session_id: sessionId(),
    mode: demo.isFinal ? 'propuesta' : 'actual',
    shown_topics: shownTopics(), // preguntas y «Para ti»: una sugerencia por tema en la sesión
    ...extra,
  })

  /**
   * Registra la sugerencia cruzada mostrada (para el panel) y no la repite en la sesión. Como las demás, una vez por
   * pestaña (firstShowing): AddButton registra la mostrada que falte al aceptarla y no debe contarse dos veces.
   */
  const noteSuggestion = (message) => {
    // Un servicio sin catálogo (RappiTravel, RappiFavor) ofrecido: cada vez que el agente lo ofrece.
    if (message.service) events.track('service_shown', { payload: { servicio: message.service } })
    if (!message.suggestion) return message
    const { concept, vertical, origin = 'agent-ask' } = message.suggestion
    noteShownTopic(concept)
    if (firstShowing({ concept, vertical, origin, generation: profile.resets }))
      events.track('suggestion_shown', { concept_id: concept, vertical, payload: { origen: origin } })
    return message
  }

  const onAction = (action) => {
    if (action.ask) return send(action.ask.text, action.ask.vertical)
    if (action.service) events.track('service_opened', { payload: { servicio: action.service } })
    go(...action.route)
  }

  /** Pone una respuesta en la fila: la siguiente sale cuando esta ya está en pantalla. */
  const ask = (run) => {
    askQueue.current = askQueue.current.then(() => botSays(run()))
  }

  /**
   * Cuando la API no contesta: «Sin conexión» y un botón que vuelve a pedir lo mismo, una sola vez (dos toques no
   * encolan dos respuestas; si vuelve a fallar, el nuevo «Sin conexión» trae su propio botón).
   */
  const offline = (run) => {
    let used = false
    return {
      text: OFFLINE,
      retry: () => {
        if (used) return
        used = true
        ask(run)
      },
    }
  }

  /** Respuesta de la API; si no contesta, «Sin conexión» con «Reintentar» (no hay respuesta local). */
  const answer = async (text, askVertical) => {
    try {
      const response = await askAgent({
        message: text,
        ...apiContext({ vertical: askVertical ?? vertical }),
        ...(lastTurn.current ? { previous: lastTurn.current } : {}),
      })
      // El pedido que queda para el próximo mensaje: «talla g» o «más barata» se leen sobre él.
      if (response.intent?.concepts?.length) {
        lastTurn.current = {
          query: response.intent.query ?? text,
          concepts: response.intent.concepts,
          vertical: response.vertical ?? null,
          product_ids: (response.products ?? []).map((p) => p.entity_id).filter(Boolean),
        }
      }
      return noteSuggestion(toMessage(response))
    } catch {
      return offline(() => answer(text, askVertical))
    }
  }

  /** Una oferta del agente para un momento (`carrito`, `vertical_por_probar`…); `nothing` es lo que dice si no tiene nada. */
  const offered = async (moment, context, nothing) => {
    try {
      const made = await offer(moment, context, { userId: userId() })
      if (!made) return { text: nothing }
      noteShown(events.track, made.products, {
        origin: `agent-${moment}`,
        concept: made.reason?.concept,
        generation: profile.resets,
      })
      return { text: made.text, products: made.products, actions: made.actions, offerReason: made.reason }
    } catch {
      return offline(() => offered(moment, context, nothing))
    }
  }

  /** «¿Con qué acompaño…?»: la oferta del agente para ese producto (el momento `carrito`). */
  const pairing = (product) =>
    offered(
      'carrito',
      { product: { entity_type: product.entityType, entity_id: product.entityId } },
      NOTHING_TO_PAIR,
    )

  const askPairing = (product) => {
    if (forgetting) return
    addMessage({ from: 'user', text: askAbout(product) })
    ask(() => pairing(product))
  }

  /** «¿Qué puedo probar?» y similares: la oferta que pidió quien abrió el buscador (`{ moment, context }`). */
  const askOffer = ({ moment, context }, text) => {
    if (forgetting) return
    addMessage({ from: 'user', text })
    ask(() => offered(moment, context, NOTHING_TO_TRY))
  }

  /** El saludo, con «Para ti» de /recommendations (sin él si la API no contesta o no tiene nada que recomendar). */
  const greet = (rows) => {
    ask(async () => {
      const waited = new Promise((resolve) => later(() => resolve([]), FOR_YOU_WAIT_MS))
      const [row] = await Promise.race([rows, waited])
      if (!row) return { text: GREETING }
      noteShown(events.track, row.products, { origin: 'para-ti', concept: row.concept, generation: profile.resets })
      return { text: GREETING, products: row.products.map(asForYou), reason: row.reason }
    })
  }

  // En orden: la pregunta N+1 sale cuando la respuesta N ya está en pantalla, así sus shown_topics incluyen
  // lo que N sugirió.
  const send = (text, askVertical) => {
    const clean = text.trim()
    if (!clean || forgetting) return
    addMessage({ from: 'user', text: clean })
    ask(() => answer(clean, askVertical))
  }

  // Abrir, paso 1: el buscador se pinta fuera de la pantalla, a la derecha (como el de «Rappi hoy»).
  useLayoutEffect(() => {
    const session = assistant.session
    if (!session) return
    // Paso 1 de la animación: hay que pintar la posición inicial antes de deslizar, así que el render extra es buscado.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase('entering')
    search.setQuery(session.search ?? '')
    setMood('wave')
    later(() => setMood('idle'), OPEN_MS + 1400)

    // Si mientras tanto se tocó "Olvidar", la respuesta es de antes de borrar: se ignora.
    const generation = profileGeneration.current
    const fresh = () => generation === profileGeneration.current
    remoteProfile(userId())
      .then((data) => fresh() && setLearnedRemote(data.interests.slice(0, 3)))
      .catch(() => fresh() && setLearnedRemote(null))
    // Una sola petición sirve a «Para ti» y a «Descubre con el agente».
    const rows = recommendations(userId())
      .then((data) => data.rows.filter((row) => row.products.length > 0))
      .catch(() => [])
    rows.then((list) => fresh() && setDiscoverRows(list.slice(0, DISCOVER_ROWS)))

    if (messages.length === 0) greet(rows)
    if (session.product) later(() => askPairing(session.product), OPEN_MS)
    else if (session.offer) later(() => askOffer(session.offer, session.query), OPEN_MS)
    else if (session.query) later(() => send(session.query), OPEN_MS)
    setChipRound((r) => r + 1)
    // Solo al abrir una sesión nueva; el resto del estado se lee en ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistant.session?.openedAt])

  // Paso 2: el navegador ya registró la posición inicial; al pasar a 'open' la transición desliza desde ahí.
  // (Sin requestAnimationFrame: en pestañas ocultas no corre y el panel quedaría afuera.)
  useLayoutEffect(() => {
    if (phase !== 'entering') return
    rootRef.current?.getBoundingClientRect()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- paso 2: depende de haber medido el DOM
    setPhase('open')
  }, [phase])

  const close = ({ viaHistory = false } = {}) => {
    setPhase('closing')
    later(() => {
      setPhase('closed')
      assistant.close({ viaHistory })
    }, CLOSE_MS)
  }

  // La pantalla que se abre desde el agente se apila sobre su entrada del historial, que guarda la búsqueda: al volver,
  // el panel se reabre con ella (AssistantContext).
  const leave = () => {
    if (window.history.state?.assistant)
      window.history.replaceState({ ...window.history.state, assistantSearch: search.query }, '')
  }
  const go = (name, params) => {
    leave()
    push(name, params)
    close({ viaHistory: true })
  }

  // Si otra cosa apila una pantalla con el panel abierto (la barra del carrito abre el checkout), el panel se cierra
  // igual que con `go`, para no quedar encima de esa pantalla.
  const depthRef = useRef(depth)
  useEffect(() => {
    const grew = depth > depthRef.current
    depthRef.current = depth
    if (grew && assistant.isOpen && phase === 'open') {
      leave()
      close({ viaHistory: true })
    }
    // Solo reacciona al cambio de profundidad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depth])

  // Gesto "volver" (o botón atrás) con el asistente abierto: se cierra con su animación.
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })
  useEffect(() => {
    if (!assistant.isOpen) return undefined
    const onPopState = (event) => {
      if (!event.state?.assistant) closeRef.current({ viaHistory: true })
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [assistant.isOpen])

  // Teclado y VoiceOver: foco adentro al abrir, Escape cierra, Tab no sale, el foco vuelve al cerrar.
  useDialog(rootRef, assistant.isOpen, () => closeRef.current())

  const markStreamed = useCallback((id) => {
    setMood((m) => (m === 'talk' ? 'idle' : m))
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, animate: false } : m)))
  }, [])

  if (phase === 'closed' && !assistant.isOpen) return null

  // Cada respuesta se anuncia completa y una vez: la burbuja la escribe letra por letra, el lector de pantalla no.
  const lastAnswer = messages.findLast((m) => m.from === 'bot' && !m.typing)
  const announcement = lastAnswer?.text ?? ''

  const style = { transitionDuration: `${phase === 'closing' ? CLOSE_MS : OPEN_MS}ms` }
  // Lo aprendido viene de rappi-ia (conceptos, sin sensibles); sin perfil del servidor no se muestra.
  const learned = learnedRemote ?? []
  const forgetAll = async () => {
    setForgetting(true) // mientras tanto no se envía nada: una pregunta nueva recrearía lo borrado
    profileGeneration.current++
    lastTurn.current = null
    profile.reset()
    setLearnedRemote(null)
    setDiscoverRows([])
    // Lo que ya salió (un guardado del juego, un pedido, preguntas pendientes, un lote de eventos) podría recrear lo
    // olvidado en el servidor: se espera antes del DELETE, y lo que haya dejado en cola se descarta.
    await Promise.allSettled([game.settle()])
    await ordersSettled()
    await Promise.allSettled([askQueue.current])
    events.clear()
    clearShownTopics()
    await events.settled()
    try {
      await forget(userId())
      // Borrar el perfil borró también el progreso del juego: queda en cero sin subirlo (subirlo lo recrearía).
      game.forget()
      // La conversación hablaba de lo aprendido («Vi que te gusta…»): se reemplaza para que se vea que ya no está.
      setMessages([{ id: nextId++, from: 'bot', text: 'Listo, olvidé lo que aprendí de ti 🧹 ¿Qué se te antoja hoy?' }])
    } catch {
      botSays({ text: 'No pude borrar lo aprendido en el servidor 😿 Inténtalo de nuevo en un rato.' })
    } finally {
      setForgetting(false)
    }
  }

  // Lo que el agente muestra es su última respuesta (no un historial), con lo que la persona eligió.
  const current = messages.findLast((m) => m.from === 'bot')
  const asked = messages.findLast((m) => m.from === 'user')
  const showAsked = asked && current && messages.indexOf(asked) < messages.indexOf(current)
  const openStore = (store) => go('store', { store })
  // Un producto o plato de la API abre su tienda por id (otras pueden tener el mismo nombre); sin `storeId` no hay
  // tienda que abrir.
  const openProduct = (product) => {
    if (product.storeId == null) return
    go('store', { store: storeOfProduct(product), item: product })
  }

  return (
    <div
      ref={rootRef}
      className={`assistant agent-search is-${phase}${cart.count > 0 ? ' has-cart' : ''}`}
      style={style}
      role="dialog"
      aria-modal="true"
      aria-label={`Buscador con ${AGENT_NAME}`}
    >
      <p className="sr-only" aria-live="polite" data-testid="assistant-announcer">
        {announcement}
      </p>

      <header className="search-header agent-search-header">
        <BackButton className="search-back" onClick={() => close()} />
        <label className="search-field agent-search-field">
          <SparkleIcon size={20} />
          <input
            ref={inputRef}
            type="search"
            aria-label="Buscar en Rappi"
            placeholder="What do you want today?"
            value={search.query}
            maxLength={500}
            onChange={(e) => search.setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search.logSearch(search.query)}
            onBlur={() => search.logSearch(search.query)}
          />
          {search.hasQuery && (
            <button type="button" className="search-clear" aria-label="Borrar" onClick={() => search.setQuery('')}>
              ×
            </button>
          )}
        </label>
      </header>

      <div className="agent-search-body">
        {search.hasQuery ? (
          <div className="agent-block">
            <SearchResults
              query={search.query}
              data={search.data}
              loading={search.loading}
              error={search.error}
              onRetry={search.retry}
              onOpenProduct={openProduct}
              onOpenVertical={(vertical) => go(...routeForScreen(vertical))}
              onTryAnother={() => {
                search.setQuery('')
                inputRef.current?.focus()
              }}
            />
          </div>
        ) : (
          <>
            <section className="agent-card" aria-label={`Recomendaciones de ${AGENT_NAME}`}>
              <header className="agent-card-head">
                <span className="agent-card-mascot">
                  <Mascot size={44} badge mood={mood} />
                </span>
                <span>
                  <strong>{AGENT_NAME}</strong>
                  <small>
                    <i className="assistant-online" /> Tu asistente Rappi
                  </small>
                </span>
              </header>

              {learned.length > 0 && (
                <div className="assistant-learning">
                  <span>Aprendiendo de ti:</span>
                  {learned.map((item) => (
                    <b key={item.concept}>{item.label}</b>
                  ))}
                  <button type="button" onClick={forgetAll}>
                    Olvidar
                  </button>
                </div>
              )}

              {showAsked && <p className="agent-asked">Elegiste «{asked.text}»</p>}
              {current && (
                <AgentMessage
                  key={current.id}
                  message={current}
                  onStreamDone={() => markStreamed(current.id)}
                  onOpenProduct={openProduct}
                  onOpenStore={openStore}
                  onAction={onAction}
                  onRetry={() => !forgetting && current.retry()}
                />
              )}

              <p className="agent-picks-label">Toca y te armo algo 👇</p>
              {/* Clave con prefijo: un número solo podría coincidir con la del mensaje de arriba (su id) y React lo duplicaría. */}
              <div key={`chips-${chipRound}`} className="assistant-chips agent-picks">
                {CHIPS.map((chip, i) => (
                  <button
                    key={chip}
                    type="button"
                    className="assistant-chip"
                    disabled={forgetting}
                    style={{ animationDelay: `${120 + i * 55}ms` }}
                    onClick={() => send(chip.replace(/^\S+\s/, ''))}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </section>

            <section className="agent-block">
              <RecentSearches onPick={search.pick} />
            </section>

            {discoverRows.length > 0 && (
              <div className="agent-block">
                <DiscoverSection rows={discoverRows} onOpen={(vertical) => go(...routeForScreen(vertical))} />
              </div>
            )}

            <section className="agent-block">
              <PopularStores onOpen={openStore} />
            </section>
          </>
        )}
      </div>
    </div>
  )
}
