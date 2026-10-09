import { Fire, Trophy } from '@phosphor-icons/react'
import { useEffect } from 'react'
import './toast.css'

const DURATION_MS = 4000

function content(event) {
  if (event.type === 'mision') {
    const days = event.streak === 1 ? 'día' : 'días'
    return {
      Icon: Fire,
      title: '¡Misión del día completa!',
      text: `+${event.value} XP · racha de ${event.streak} ${days}`,
    }
  }
  return { Icon: Trophy, title: `¡Nivel ${event.value}!`, text: 'Sigue jugando para llegar al siguiente.' }
}

/** Aviso de un logro (misión del día, nivel nuevo): se cierra solo o al tocarlo. */
export default function Toast({ event, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, DURATION_MS)
    return () => clearTimeout(timer)
  }, [event, onClose])

  const { Icon, title, text } = content(event)
  return (
    <button type="button" className={`toast toast--${event.type}`} role="status" aria-label="Aviso" onClick={onClose}>
      <span className="toast-icon">
        <Icon size={26} weight="fill" aria-hidden="true" />
      </span>
      <span className="toast-body">
        <strong>{title}</strong>
        <span>{text}</span>
      </span>
    </button>
  )
}
