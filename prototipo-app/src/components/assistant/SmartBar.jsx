import { useEffect, useId, useRef, useState } from 'react'
import { rectInPhone, useAssistant } from '../../state/AssistantContext'
import './smart-bar.css'

const HINTS = ['Pregúntale a Bigotes…', '¿Qué se te antoja hoy?', 'Arma un carrete 🍻']
const ROTATE_MS = 3200

export function SparkleIcon({ size = 22 }) {
  // Id único por ícono: el destello aparece varias veces en la Home y los ids SVG deben ser únicos.
  const gradientId = useId()
  return (
    <svg className="sparkle" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff9a3d" />
          <stop offset="0.55" stopColor="#ff5a36" />
          <stop offset="1" stopColor="#ff3d7f" />
        </linearGradient>
      </defs>
      <path
        className="sparkle-big"
        d="M10 2.5l1.9 5.6 5.6 1.9-5.6 1.9L10 17.5l-1.9-5.6L2.5 10l5.6-1.9z"
        fill={`url(#${gradientId})`}
      />
      <path
        className="sparkle-small"
        d="M18.5 13.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z"
        fill={`url(#${gradientId})`}
      />
    </svg>
  )
}

/** Barra de búsqueda inteligente de la Home: tocarla abre el asistente, que crece desde el rectángulo de la barra. */
export default function SmartBar({ compact = false }) {
  const assistant = useAssistant()
  const barRef = useRef(null)
  const [hint, setHint] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setHint((i) => (i + 1) % HINTS.length), ROTATE_MS)
    return () => clearInterval(timer)
  }, [])

  const open = () => assistant.open({ mode: 'chat', origin: rectInPhone(barRef.current) })

  return (
    <div
      ref={barRef}
      className={compact ? 'smart-bar is-compact' : 'smart-bar'}
      role="button"
      tabIndex={0}
      aria-label="Abrir asistente"
      onClick={open}
      onKeyDown={(e) => {
        // Como pressable(), pero en línea: el linter no permite pasar funciones que leen refs durante el render.
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        open()
      }}
    >
      <SparkleIcon />
      <span className="smart-bar-hint">
        <span key={hint}>{HINTS[hint]}</span>
      </span>
    </div>
  )
}
