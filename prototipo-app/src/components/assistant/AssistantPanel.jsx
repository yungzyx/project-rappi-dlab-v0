import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { chat, forget, health, profile as remoteProfile, toMessage } from '../../api/client'
import { conceptOf } from '../../api/orders'
import { firstShowing } from '../../api/useRemoteForYou'
import { forYou, greeting, reply, suggestions, ASSISTANT_NAME } from '../../assistant/brain'
import { TAGS } from '../../assistant/tags'
import { useDemo } from '../../state/DemoContext'
import { clearShownTopics, noteShownTopic, sessionId, shownTopics, useEvents, userId } from '../../state/EventsContext'
import { storeFor } from '../../data/catalog'
import { useAssistant } from '../../state/AssistantContext'
import { useDialog } from '../../hooks/useDialog'
import { WEIGHTS, useProfile } from '../../state/ProfileContext'
import { ChevronDown } from '../Icons'
import ChatMessage from './ChatMessage'
import Mascot from './Mascot'
import './assistant.css'

const OPEN_MS = 460
const CLOSE_MS = 320
const TYPING_MS = 850
const MIN_TYPING_MS = 450

/** clip-path que recorta el panel al rectángulo de origen (la barra o la mascota). */
function clipFrom(origin) {
  if (!origin) return 'inset(100% 0 0 0 round 28px)'
  const right = origin.phoneWidth - origin.left - origin.width
  const bottom = origin.phoneHeight - origin.top - origin.height
  return `inset(${origin.top}px ${right}px ${bottom}px ${origin.left}px round ${origin.height / 2}px)`
}

let nextId = 1

/** Chat del asistente. Siempre montado (para no perder la conversación); se muestra al abrirlo. */
export default function AssistantPanel({ push, vertical }) {
  const assistant = useAssistant()
  const profile = useProfile()
  const demo = useDemo()
  const events = useEvents()
  const [phase, setPhase] = useState('closed')
  const [origin, setOrigin] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [mood, setMood] = useState('idle')
  const [chipRound, setChipRound] = useState(0)
  const rootRef = useRef(null)
  const scrollRef = useRef(null)
  const timers = useRef([])
  // Preguntas en fila: la siguiente sale cuando la respuesta anterior ya está en pantalla.
  const chatQueue = useRef(Promise.resolve())
  const lastTurn = useRef(null) // pedido anterior de la conversación (para los seguimientos)
  const profileGeneration = useRef(0) // sube al "Olvidar": un perfil remoto pedido antes ya no vale
  const [learnedRemote, setLearnedRemote] = useState(null)
  const [forgetting, setForgetting] = useState(false)

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms))
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const addMessage = (message) => setMessages((prev) => [...prev, { id: nextId++, ...message }])

  /**
   * Muestra "escribiendo…" hasta que llega la respuesta (de la API o local), con un mínimo para que se note.
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
          const wait = response.source === 'api' ? Math.max(0, MIN_TYPING_MS - (Date.now() - startedAt)) : TYPING_MS
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
    mode: demo.isProposal ? 'propuesta' : 'actual',
    shown_topics: shownTopics(), // chat y «Para ti»: una sugerencia por tema en la sesión
    ...extra,
  })

  /**
   * Registra la sugerencia cruzada mostrada (para el panel) y no la repite en la sesión. Como las demás, una vez por
   * pestaña (firstShowing): AddButton registra la mostrada que falte al aceptarla y no debe contarse dos veces.
   */
  const noteSuggestion = (message) => {
    // Un servicio sin catálogo (RappiTravel, RappiFavor) ofrecido: cada vez que Bigotes lo ofrece.
    if (message.service) events.track('service_shown', { payload: { servicio: message.service } })
    if (!message.suggestion) return message
    const { concept, vertical, origin = 'chat' } = message.suggestion
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

  /**
   * Lo que el cerebro local sugiere por iniciativa propia («Para ti» y el complemento, marcados como sugerencia) cuenta
   * como mostrado una vez por pestaña, por concepto, vertical y origen: los mismos que lleva su aceptación (AddButton).
   */
  const noteLocalSuggestions = (message) => {
    const suggested = [...(message.products ?? []), ...(message.suggestion?.products ?? [])]
    for (const product of suggested.filter((item) => item.fromSuggestion)) {
      const concept = conceptOf(product)
      const origin = product.suggestionOrigin
      if (concept && firstShowing({ concept, vertical: product.vertical, origin, generation: profile.resets }))
        events.track('suggestion_shown', {
          concept_id: concept,
          vertical: product.vertical,
          payload: { origen: origin },
        })
    }
    return message
  }

  /** Respuesta de las reglas del prototipo: queda marcada en pantalla para que se sepa qué Bigotes contestó. */
  const localReply = (message) => noteLocalSuggestions({ ...message, source: 'local' })

  /** Respuesta de la API; si no está o falla, el cerebro local de siempre. */
  const answer = async (text, askVertical) => {
    if (await health()) {
      try {
        const response = await chat({
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
        // cae al cerebro local
      }
    }
    return localReply(reply(text, profile))
  }

  // En orden: la pregunta N+1 sale cuando la respuesta N ya está en pantalla, así sus shown_topics incluyen
  // lo que N sugirió.
  const send = (text, askVertical) => {
    const clean = text.trim()
    if (!clean || forgetting) return
    setDraft('')
    addMessage({ from: 'user', text: clean })
    profile.track(clean, WEIGHTS.query)
    chatQueue.current = chatQueue.current.then(() => botSays(answer(clean, askVertical)))
  }

  // Abrir, paso 1: recorta el panel al rectángulo de origen.
  useLayoutEffect(() => {
    const session = assistant.session
    if (!session) return
    // Paso 1 de la animación: hay que pintar el recorte inicial antes de expandir, así que el render extra es buscado.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(session.origin ?? null)
    setPhase('from-origin')
    setMood('wave')
    later(() => setMood('idle'), OPEN_MS + 1400)

    // Si mientras tanto se tocó "Olvidar", la respuesta es de antes de borrar: se ignora.
    const generation = profileGeneration.current
    const fresh = () => generation === profileGeneration.current
    health({ force: true }).then((capabilities) => {
      if (!fresh()) return
      if (!capabilities) return setLearnedRemote(null) // sin API: cerebro local
      remoteProfile(userId())
        .then((data) => fresh() && setLearnedRemote(data.interests.slice(0, 3)))
        .catch(() => fresh() && setLearnedRemote(null))
    })

    const isFirst = messages.length === 0
    if (isFirst) {
      const picks = forYou(profile)
      addMessage(
        noteLocalSuggestions({
          from: 'bot',
          animate: true,
          text: greeting(profile),
          products: picks.products,
          reason: picks.reason,
        }),
      )
    }
    if (session.query) later(() => send(session.query), OPEN_MS)
    setChipRound((r) => r + 1)
    // Solo al abrir una sesión nueva; el resto del estado se lee en ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistant.session?.openedAt])

  // Paso 2: el navegador ya registró el recorte inicial; al pasar a 'open' la transición crece desde ahí.
  // (Sin requestAnimationFrame: en pestañas ocultas no corre y el panel quedaría recortado.)
  useLayoutEffect(() => {
    if (phase !== 'from-origin') return
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

  // La pantalla que se abre desde el chat reemplaza la entrada del asistente en el historial.
  const go = (name, params) => {
    push(name, params, { replace: Boolean(window.history.state?.assistant) })
    close({ viaHistory: true })
  }

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

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const markStreamed = useCallback((id) => {
    setMood((m) => (m === 'talk' ? 'idle' : m))
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, animate: false } : m)))
  }, [])

  if (phase === 'closed' && !assistant.isOpen) return null

  // Cada respuesta se anuncia completa y una vez: la burbuja la escribe letra por letra, el lector de pantalla no.
  const lastAnswer = messages.findLast((m) => m.from === 'bot' && !m.typing)
  const announcement = lastAnswer ? `${lastAnswer.text}${lastAnswer.source === 'local' ? ' (respuesta local)' : ''}` : ''

  const expanded = phase === 'open'
  const style = {
    clipPath: expanded ? 'inset(0px 0px 0px 0px round 0px)' : clipFrom(origin),
    transitionDuration: `${phase === 'closing' ? CLOSE_MS : OPEN_MS}ms`,
  }
  const chips = suggestions(profile)
  // Con la API, lo aprendido viene de rappi-ia (conceptos, sin sensibles); sin ella (o si aún no aprendió nada),
  // del perfil local. Así "Olvidar" se ve siempre que alguno de los dos tenga algo.
  const learned = learnedRemote?.length
    ? learnedRemote
    : profile.top.slice(0, 3).map((tag) => ({ concept: tag, label: `${TAGS[tag].emoji} ${TAGS[tag].label}` }))
  const forgetAll = async () => {
    setForgetting(true) // mientras tanto no se envía nada: una pregunta nueva recrearía lo borrado
    profileGeneration.current++
    lastTurn.current = null
    profile.reset()
    setLearnedRemote(null)
    // Lo que ya salió (preguntas pendientes, un lote de eventos) podría recrear lo olvidado en el servidor: se
    // espera antes del DELETE, y lo que haya dejado en cola se descarta.
    await Promise.allSettled([chatQueue.current])
    events.clear()
    clearShownTopics()
    await events.settled()
    // Siempre se intenta en el servidor (aunque el último chequeo de salud haya fallado).
    try {
      await forget(userId())
      // La conversación hablaba de lo aprendido («Vi que te gusta…»): se reemplaza para que se vea que ya no está.
      setMessages([{ id: nextId++, from: 'bot', text: 'Listo, olvidé lo que aprendí de ti 🧹 ¿Qué se te antoja hoy?' }])
    } catch {
      if (await health({ force: true })) {
        botSays({ text: 'No pude borrar lo aprendido en el servidor 😿 Inténtalo de nuevo en un rato.' })
      }
    } finally {
      setForgetting(false)
    }
  }

  return (
    <div
      ref={rootRef}
      className={`assistant is-${phase}`}
      style={style}
      role="dialog"
      aria-modal="true"
      aria-label={`Asistente ${ASSISTANT_NAME}`}
    >
      <div className="assistant-glow" />
      <p className="sr-only" aria-live="polite" data-testid="assistant-announcer">
        {announcement}
      </p>

      <header className="assistant-header">
        <button type="button" className="assistant-close tap" aria-label="Cerrar" onClick={() => close()}>
          <ChevronDown size={20} />
        </button>
        <div className="assistant-hero">
          <span className="assistant-hero-mascot">
            <Mascot size={46} badge mood={mood} />
          </span>
          <span>
            <strong>{ASSISTANT_NAME}</strong>
            <small>
              <i className="assistant-online" /> Tu asistente Rappi
            </small>
          </span>
        </div>
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

      <div ref={scrollRef} className="assistant-messages">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            onStreamDone={() => markStreamed(message.id)}
            onOpenProduct={(product) =>
              go('store', {
                // Un plato real abre su sucursal (por id): otras pueden tener el mismo nombre.
                store: storeFor({ id: product.storeId, name: product.store }) ?? {
                  name: product.store,
                  img: product.img,
                  eta: product.eta,
                },
                item: product,
              })
            }
            onOpenStore={(store) => go('store', { store })}
            onAction={onAction}
          />
        ))}
      </div>

      <div className="assistant-bottom">
        <div key={chipRound} className="assistant-chips">
          {chips.map((chip, i) => (
            <button
              key={chip}
              type="button"
              className="assistant-chip"
              style={{ animationDelay: `${120 + i * 55}ms` }}
              onClick={() => send(chip.replace(/^\S+\s/, ''))}
            >
              {chip}
            </button>
          ))}
        </div>

        <form
          className="assistant-input"
          onSubmit={(e) => {
            e.preventDefault()
            send(draft)
          }}
        >
          <input
            data-autofocus
            aria-label={`Mensaje para ${ASSISTANT_NAME}`}
            value={draft}
            disabled={forgetting}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Escríbele a ${ASSISTANT_NAME}…`}
            maxLength={500}
            enterKeyHint="send"
          />
          {draft.trim() && (
            <button type="submit" className="assistant-send" aria-label="Enviar">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 19V5M5.5 11.5 12 5l6.5 6.5"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
