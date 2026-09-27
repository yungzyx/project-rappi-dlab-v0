import { useEffect, useRef, useState } from 'react'
import { rectInPhone, useAssistant } from '../../state/AssistantContext'
import './smart-bar.css'

const HINTS = [
  'Pregúntale a Bigotes…',
  '¿Qué se te antoja hoy?',
  'Arma un carrete 🍻',
  'Busca con una foto 📷',
  'Dime y te lo busco 🎙️',
]
const ROTATE_MS = 3200

export function SparkleIcon({ size = 22 }) {
  return (
    <svg className="sparkle" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="sparkle-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff9a3d" />
          <stop offset="0.55" stopColor="#ff5a36" />
          <stop offset="1" stopColor="#ff3d7f" />
        </linearGradient>
      </defs>
      <path
        className="sparkle-big"
        d="M10 2.5l1.9 5.6 5.6 1.9-5.6 1.9L10 17.5l-1.9-5.6L2.5 10l5.6-1.9z"
        fill="url(#sparkle-g)"
      />
      <path
        className="sparkle-small"
        d="M18.5 13.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z"
        fill="url(#sparkle-g)"
      />
    </svg>
  )
}

export function CameraIcon({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 8.5A2 2 0 0 1 6 6.5h2l1.5-2h5l1.5 2h2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="12.6" r="3.4" />
    </svg>
  )
}

export function MicIcon({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  )
}

/**
 * Barra de búsqueda inteligente de la Home: tocarla abre el chat; 📷 abre la cámara/galería; 🎙️ la voz.
 * El asistente crece desde el rectángulo de la barra.
 */
export default function SmartBar({ compact = false }) {
  const assistant = useAssistant()
  const barRef = useRef(null)
  const fileRef = useRef(null)
  const [hint, setHint] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setHint((i) => (i + 1) % HINTS.length), ROTATE_MS)
    return () => clearInterval(timer)
  }, [])

  const open = (mode, extra = {}) => assistant.open({ mode, origin: rectInPhone(barRef.current), ...extra })

  const onPhoto = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) open('photo', { photo: URL.createObjectURL(file) })
  }

  return (
    <div
      ref={barRef}
      className={compact ? 'smart-bar is-compact' : 'smart-bar'}
      role="button"
      tabIndex={0}
      aria-label="Abrir asistente"
      onClick={() => open('chat')}
      onKeyDown={(e) => e.key === 'Enter' && open('chat')}
    >
      <SparkleIcon />
      <span className="smart-bar-hint">
        <span key={hint}>{HINTS[hint]}</span>
      </span>
      <button
        type="button"
        className="smart-bar-action"
        aria-label="Buscar con foto"
        onClick={(e) => {
          e.stopPropagation()
          fileRef.current.click()
        }}
      >
        <CameraIcon />
      </button>
      <button
        type="button"
        className="smart-bar-action"
        aria-label="Hablar"
        onClick={(e) => {
          e.stopPropagation()
          open('voice')
        }}
      >
        <MicIcon />
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
    </div>
  )
}
