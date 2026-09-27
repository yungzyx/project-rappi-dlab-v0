import { useRef } from 'react'
import { TAGS } from '../../assistant/tags'
import { rectInPhone, useAssistant } from '../../state/AssistantContext'
import { useNudge } from '../../state/NudgeContext'
import Mascot from './Mascot'
import './nudge.css'

/** Burbuja de Bigotes sobre la barra del carrito: "¿Te tinca sumar 🍿 snacks?" → abre el chat con esa búsqueda. */
export default function Nudge({ raised }) {
  const { nudge, dismiss } = useNudge()
  const assistant = useAssistant()
  const ref = useRef(null)

  if (!nudge || assistant.isOpen) return null

  const from = TAGS[nudge.tag]
  const to = TAGS[nudge.complement]

  const open = () => {
    dismiss()
    assistant.open({ mode: 'chat', origin: rectInPhone(ref.current), query: to.label })
  }

  return (
    <div key={nudge.id} ref={ref} className={raised ? 'nudge is-raised' : 'nudge'} role="status">
      <Mascot size={40} badge mood="wave" />
      <p>
        <strong>
          ¿Te tinca sumar {to.emoji} {to.label.toLowerCase()}?
        </strong>
        <span>
          Porque agregaste {from.emoji} {from.label.toLowerCase()}
        </span>
      </p>
      <button type="button" className="nudge-go tap" onClick={open}>
        Ver
      </button>
      <button type="button" className="nudge-close" aria-label="Cerrar" onClick={dismiss}>
        ×
      </button>
    </div>
  )
}
