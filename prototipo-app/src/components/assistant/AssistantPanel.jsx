import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { forYou, greeting, photoReply, reply, suggestions, ASSISTANT_NAME, VOICE_SAMPLES } from '../../assistant/brain'
import { TAGS } from '../../assistant/tags'
import { findStore } from '../../data/catalog'
import { useAssistant } from '../../state/AssistantContext'
import { WEIGHTS, useProfile } from '../../state/ProfileContext'
import { ChevronDown } from '../Icons'
import ChatMessage from './ChatMessage'
import Mascot from './Mascot'
import { CameraIcon, MicIcon } from './SmartBar'
import './assistant.css'

const OPEN_MS = 460
const CLOSE_MS = 320
const TYPING_MS = 850
const VOICE_LISTEN_MS = 2600
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
export default function AssistantPanel({ push }) {
  const assistant = useAssistant()
  const profile = useProfile()
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

  const later = (fn, ms, bucket = timers) => bucket.current.push(setTimeout(fn, ms))
  useEffect(() => () => [...timers.current, ...voiceTimers.current].forEach(clearTimeout), [])

  const addMessage = (message) => setMessages((prev) => [...prev, { id: nextId++, ...message }])

  const botSays = useCallback((response) => {
    const typingId = nextId++
    setMood('think')
    setMessages((prev) => [...prev, { id: typingId, from: 'bot', typing: true }])
    later(() => {
      setMood('talk')
      // Id nuevo: si reutilizara el del indicador, React conservaría su estado y mostraría las tarjetas antes del texto.
      setMessages((prev) => [...prev.filter((m) => m.id !== typingId), { id: nextId++, from: 'bot', animate: true, ...response }])
      setChipRound((r) => r + 1)
    }, TYPING_MS)
  }, [])

  const send = (text) => {
    const clean = text.trim()
    if (!clean) return
    setDraft('')
    addMessage({ from: 'user', text: clean })
    const response = reply(clean, profile)
    if (response.tags) profile.trackTags(response.tags, WEIGHTS.query)
    else profile.track(clean, WEIGHTS.query)
    botSays(response)
  }

  const sendPhoto = (url) => {
    addMessage({ from: 'user', image: url })
    botSays(photoReply(profile))
  }

  const listen = () => {
    const sample = VOICE_SAMPLES[voiceIndex.current++ % VOICE_SAMPLES.length]
    setMood('listen')
    setVoice({ transcript: '' })
    const words = sample.split(' ')
    words.forEach((_, i) => {
      later(() => setVoice({ transcript: words.slice(0, i + 1).join(' ') }), 700 + (i * (VOICE_LISTEN_MS - 900)) / words.length, voiceTimers)
    })
    later(
      () => {
        setVoice(null)
        send(sample)
      },
      VOICE_LISTEN_MS,
      voiceTimers,
    )
  }

  const cancelVoice = () => {
    voiceTimers.current.forEach(clearTimeout)
    voiceTimers.current = []
    setVoice(null)
    setMood('idle')
  }

  // Abrir, paso 1: recorta el panel al rectángulo de origen.
  useLayoutEffect(() => {
    const session = assistant.session
    if (!session) return
    setOrigin(session.origin ?? null)
    setPhase('from-origin')
    setMood('wave')
    later(() => setMood('idle'), OPEN_MS + 1400)

    const isFirst = messages.length === 0
    if (isFirst) {
      const picks = forYou(profile)
      addMessage({ from: 'bot', animate: true, text: greeting(profile), products: picks.products, reason: picks.reason })
    }
    if (session.mode === 'voice') later(listen, OPEN_MS, voiceTimers)
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
    setPhase('open')
  }, [phase])

  const close = () => {
    cancelVoice()
    setPhase('closing')
    later(() => {
      setPhase('closed')
      assistant.close()
    }, CLOSE_MS)
  }

  const go = (name, params) => {
    push(name, params)
    close()
  }

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, voice])

  const markStreamed = useCallback((id) => {
    setMood((m) => (m === 'talk' ? 'idle' : m))
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, animate: false } : m)))
  }, [])

  if (phase === 'closed' && !assistant.isOpen) return null

  const expanded = phase === 'open'
  const style = {
    clipPath: expanded ? 'inset(0px 0px 0px 0px round 0px)' : clipFrom(origin),
    transitionDuration: `${phase === 'closing' ? CLOSE_MS : OPEN_MS}ms`,
  }
  const chips = suggestions(profile)
  const learned = profile.top.slice(0, 3)

  return (
    <div ref={rootRef} className={`assistant is-${phase}`} style={style} role="dialog" aria-modal="true" aria-label={`Asistente ${ASSISTANT_NAME}`}>
      <div className="assistant-glow" />

      <header className="assistant-header">
        <button type="button" className="assistant-close tap" aria-label="Cerrar" onClick={close}>
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
          {learned.map((tag) => (
            <b key={tag}>
              {TAGS[tag].emoji} {TAGS[tag].label}
            </b>
          ))}
          <button type="button" onClick={profile.reset}>
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
              go('store', { store: findStore(product.store) ?? { name: product.store, img: product.img, eta: product.eta } })
            }
            onOpenStore={(store) => go('store', { store })}
            onAction={(action) => go(...action.route)}
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
            <p>{voice.transcript || 'Te escucho…'}</p>
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
            <button type="button" className="assistant-icon-btn" aria-label="Enviar foto" onClick={() => fileRef.current.click()}>
              <CameraIcon />
            </button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Escríbele a ${ASSISTANT_NAME}…`}
              enterKeyHint="send"
            />
            {draft.trim() ? (
              <button type="submit" className="assistant-send" aria-label="Enviar">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
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
                if (file) sendPhoto(URL.createObjectURL(file))
              }}
            />
          </form>
        )}
      </div>
    </div>
  )
}
