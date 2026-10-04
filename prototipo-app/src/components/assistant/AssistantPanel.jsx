import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { chat, chatPhoto, chatVoice, forget, health, profile as remoteProfile, toMessage } from '../../api/client'
import { forYou, greeting, photoReply, reply, suggestions, ASSISTANT_NAME, VOICE_SAMPLES } from '../../assistant/brain'
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
import { CameraIcon, MicIcon } from './SmartBar'
import './assistant.css'

const OPEN_MS = 460
const CLOSE_MS = 320
const TYPING_MS = 850
const MIN_TYPING_MS = 450
const VOICE_LISTEN_MS = 2600
const MAX_RECORDING_MS = 7000
const WAVE_BARS = 7

/** clip-path que recorta el panel al rectángulo de origen (la barra o la mascota). */
function clipFrom(origin) {
  if (!origin) return 'inset(100% 0 0 0 round 28px)'
  const right = origin.phoneWidth - origin.left - origin.width
  const bottom = origin.phoneHeight - origin.top - origin.height
  return `inset(${origin.top}px ${right}px ${bottom}px ${origin.left}px round ${origin.height / 2}px)`
}

let nextId = 1

/** Chat del asistente. Siempre montado (para no perder la conversación); se muestra al abrirlo. */
/** ¿Se puede grabar de verdad? El micrófono solo funciona en localhost o https (en el iPhone por http, no). */
const canRecord = () =>
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  Boolean(navigator.mediaDevices?.getUserMedia) &&
  'MediaRecorder' in window

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
  const [voice, setVoice] = useState(null)
  const [chipRound, setChipRound] = useState(0)
  const rootRef = useRef(null)
  const scrollRef = useRef(null)
  const fileRef = useRef(null)
  const voiceIndex = useRef(0)
  const timers = useRef([])
  const voiceTimers = useRef([])
  const recorder = useRef(null)
  // Cada intento de voz lleva un número: cancelar (o cerrar) lo sube, y lo que llegue de un intento viejo se ignora.
  const voiceAttempt = useRef(0)
  const voicePending = useRef(false) // pidiendo el micrófono: los toques extra se ignoran
  const voiceUpload = useRef(null)
  const voiceRequest = useRef(null) // audio ya subido: "Olvidar" espera a que el servidor termine
  // Preguntas en fila: la siguiente sale cuando la respuesta anterior ya está en pantalla.
  const chatQueue = useRef(Promise.resolve())
  const profileGeneration = useRef(0) // sube al "Olvidar": un perfil remoto pedido antes ya no vale
  const [learnedRemote, setLearnedRemote] = useState(null)
  const [forgetting, setForgetting] = useState(false)

  const later = (fn, ms, bucket = timers) => bucket.current.push(setTimeout(fn, ms))
  useEffect(() => () => [...timers.current, ...voiceTimers.current].forEach(clearTimeout), [])

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
    shown_topics: shownTopics(), // texto, voz, foto y «Para ti»: una sugerencia por tema en la sesión
    ...extra,
  })

  /** Registra la sugerencia cruzada mostrada (para el panel) y no la repite en la sesión. */
  const noteSuggestion = (message) => {
    if (!message.suggestion) return message
    noteShownTopic(message.suggestion.concept)
    events.track('suggestion_shown', {
      concept_id: message.suggestion.concept,
      vertical: message.suggestion.vertical,
      payload: { origen: 'chat' },
    })
    return message
  }

  /** Respuesta de las reglas del prototipo: queda marcada en pantalla para que se sepa qué Bigotes contestó. */
  const localReply = (message) => ({ ...message, source: 'local' })

  /** Respuesta de la API; si no está o falla, el cerebro local de siempre. */
  const answer = async (text, askVertical) => {
    if (await health()) {
      try {
        const response = await chat({
          message: text,
          ...apiContext({ vertical: askVertical ?? vertical }),
        })
        return noteSuggestion(toMessage(response))
      } catch {
        // cae al cerebro local
      }
    }
    return localReply(reply(text, profile))
  }

  // En orden: la pregunta N+1 sale cuando la respuesta N ya está en pantalla, así sus shown_topics incluyen
  // lo que N sugirió. `local`: responde el cerebro local, sin la API (voz simulada).
  const send = (text, askVertical, { local = false } = {}) => {
    const clean = text.trim()
    if (!clean || forgetting) return
    setDraft('')
    addMessage({ from: 'user', text: clean })
    profile.track(clean, WEIGHTS.query)
    chatQueue.current = chatQueue.current.then(() =>
      botSays(local ? localReply(reply(clean, profile)) : answer(clean, askVertical)),
    )
  }

  const sendPhoto = (file) => {
    if (forgetting) return
    const url = URL.createObjectURL(file)
    addMessage({ from: 'user', image: url })
    const run = async () => {
      if ((await health())?.fotos) {
        try {
          return noteSuggestion(toMessage(await chatPhoto(file, apiContext())))
        } catch {
          // cae a la respuesta simulada
        }
      }
      return localReply(photoReply(profile))
    }
    // En la misma fila que las preguntas: "Olvidar" la espera (el servidor registra la foto al responder).
    chatQueue.current = chatQueue.current.then(() => botSays(run()))
  }

  /** Voz real: graba hasta 7 s (o hasta "Listo") y la API la transcribe con Whisper. El audio no se guarda. */
  const record = (stream, attempt) => {
    const chunks = []
    const media = new MediaRecorder(stream)
    recorder.current = media
    media.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
    media.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop())
      if (recorder.current === media) recorder.current = null
      if (attempt !== voiceAttempt.current) return // cancelada
      setVoice({ transcript: 'Transcribiendo…' })
      const upload = new AbortController()
      voiceUpload.current = upload
      try {
        const blob = new Blob(chunks, { type: media.mimeType || 'audio/webm' })
        const file = new File([blob], 'voz.webm', { type: blob.type })
        const request = chatVoice(file, apiContext(), { signal: upload.signal })
        voiceRequest.current = request
        const message = toMessage(await request)
        if (attempt !== voiceAttempt.current) return // se canceló (o se olvidó) mientras transcribía
        setVoice(null)
        if (message.transcript && !message.transcript.discarded)
          addMessage({ from: 'user', text: message.transcript.text })
        botSays(noteSuggestion(message))
      } catch {
        if (attempt !== voiceAttempt.current) return
        setVoice(null)
        botSays({ text: 'No pude procesar el audio 🙉 ¿Me lo escribes?' })
      }
    }
    media.start()
    setMood('listen')
    setVoice({ transcript: '', recording: true })
    later(() => media.state === 'recording' && media.stop(), MAX_RECORDING_MS, voiceTimers)
  }

  const stopRecording = () => recorder.current?.state === 'recording' && recorder.current.stop()

  /** Voz real si se puede; si no, la simulada. Un intento a la vez: los toques mientras se pide el micrófono se ignoran. */
  const listen = async () => {
    if (forgetting || voicePending.current || recorder.current) return
    voicePending.current = true
    const attempt = ++voiceAttempt.current
    const stale = () => attempt !== voiceAttempt.current // se canceló o se cerró el panel mientras tanto
    try {
      if (!canRecord() || !(await health())?.voz) {
        if (!stale()) simulateVoice()
        return
      }
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch (error) {
        if (stale()) return
        // Si el usuario negó el permiso no se inventa una frase como si la hubiera dicho: se le avisa.
        if (error?.name === 'NotAllowedError')
          botSays({ text: 'Tu micrófono está bloqueado 🙊 Actívalo en el navegador o escríbeme.' })
        else simulateVoice()
        return
      }
      if (stale() || recorder.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      record(stream, attempt)
    } finally {
      if (!stale()) voicePending.current = false
    }
  }

  // Voz simulada (sin micrófono o sin voz en la API): recorre frases de ejemplo. Las contesta el cerebro local:
  // no son del usuario, así que no van a la API (no ensucian su perfil ni el panel).
  const simulateVoice = () => {
    const sample = VOICE_SAMPLES[voiceIndex.current++ % VOICE_SAMPLES.length]
    setMood('listen')
    setVoice({ transcript: '' })
    const words = sample.split(' ')
    words.forEach((_, i) => {
      later(
        () => setVoice({ transcript: words.slice(0, i + 1).join(' ') }),
        700 + (i * (VOICE_LISTEN_MS - 900)) / words.length,
        voiceTimers,
      )
    })
    later(
      () => {
        setVoice(null)
        send(sample, undefined, { local: true })
      },
      VOICE_LISTEN_MS,
      voiceTimers,
    )
  }

  const cancelVoice = () => {
    voiceAttempt.current++ // lo que llegue después (permiso, grabación, transcripción) es de un intento viejo
    voicePending.current = false
    voiceUpload.current?.abort()
    const media = recorder.current
    recorder.current = null
    if (media) {
      media.stream.getTracks().forEach((track) => track.stop())
      if (media.state !== 'inactive') media.stop()
    }
    voiceTimers.current.forEach(clearTimeout)
    voiceTimers.current = []
    setVoice(null)
    setMood('idle')
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
      addMessage({
        from: 'bot',
        animate: true,
        text: greeting(profile),
        products: picks.products,
        reason: picks.reason,
      })
    }
    if (session.mode === 'voice') later(listen, OPEN_MS, voiceTimers)
    if (session.query) later(() => send(session.query), OPEN_MS)
    if (session.mode === 'photo' && session.photo) later(() => sendPhoto(session.photo), OPEN_MS)
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
    cancelVoice()
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
  }, [messages, voice])

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
    profile.reset()
    setLearnedRemote(null)
    // Voz: si está grabando se descarta sin subirla; si ya se subió, se espera al servidor y su respuesta se ignora.
    const voiceInFlight = voiceRequest.current
    if (recorder.current || voicePending.current) cancelVoice()
    else {
      voiceAttempt.current++
      setVoice(null)
    }
    // Lo que ya salió (preguntas y fotos pendientes, audio, un lote de eventos) podría recrear lo olvidado en el
    // servidor: se espera antes del DELETE, y lo que haya dejado en cola se descarta.
    await Promise.allSettled([chatQueue.current, voiceInFlight])
    events.clear()
    clearShownTopics()
    await events.settled()
    // Siempre se intenta en el servidor (aunque el último chequeo de salud haya fallado).
    try {
      await forget(userId())
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
            onAction={(action) => (action.ask ? send(action.ask.text, action.ask.vertical) : go(...action.route))}
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

        {voice ? (
          <div className="assistant-voice">
            <div className="assistant-wave" aria-hidden="true">
              {Array.from({ length: WAVE_BARS }, (_, i) => (
                <span key={i} style={{ animationDelay: `${i * 90}ms` }} />
              ))}
            </div>
            <p role="status">{voice.transcript || 'Te escucho…'}</p>
            {voice.recording && (
              <button type="button" className="assistant-voice-cancel" onClick={stopRecording}>
                Listo
              </button>
            )}
            <button type="button" className="assistant-voice-cancel" onClick={cancelVoice}>
              Cancelar
            </button>
          </div>
        ) : (
          <form
            className="assistant-input"
            onSubmit={(e) => {
              e.preventDefault()
              send(draft)
            }}
          >
            <button
              type="button"
              className="assistant-icon-btn"
              aria-label="Enviar foto"
              onClick={() => fileRef.current.click()}
            >
              <CameraIcon />
            </button>
            <input
              data-autofocus
              aria-label={`Mensaje para ${ASSISTANT_NAME}`}
              value={draft}
              disabled={forgetting}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Escríbele a ${ASSISTANT_NAME}…`}
              enterKeyHint="send"
            />
            {draft.trim() ? (
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
            ) : (
              <button type="button" className="assistant-icon-btn" aria-label="Hablar" onClick={listen}>
                <MicIcon />
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) sendPhoto(file)
              }}
            />
          </form>
        )}
      </div>
    </div>
  )
}
