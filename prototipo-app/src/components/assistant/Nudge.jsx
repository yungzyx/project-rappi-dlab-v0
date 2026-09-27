import { useEffect, useRef } from 'react'
import { TAGS } from '../../assistant/tags'
import { rectInPhone, useAssistant } from '../../state/AssistantContext'
import { useEvents } from '../../state/EventsContext'
import { useNudge } from '../../state/NudgeContext'
import Mascot from './Mascot'
import './nudge.css'

/** Burbuja de Bigotes sobre la barra del carrito: "¿Te tinca sumar 🍿 snacks?" → abre el chat con esa búsqueda. */
export default function Nudge({ raised }) {
  const { nudge, dismiss } = useNudge()
  const assistant = useAssistant()
  const events = useEvents()
  const ref = useRef(null)
  const visible = Boolean(nudge) && !assistant.isOpen

  useEffect(() => {
    if (visible) events.track('suggestion_shown', { payload: { from: nudge.tag, to: nudge.complement, origen: 'aviso' } })
  }, [visible, nudge, events])

  if (!visible) return null

  const from = TAGS[nudge.tag]
  const to = TAGS[nudge.complement]

  const open = () => {
    events.track('suggestion_accepted', { payload: { from: nudge.tag, to: nudge.complement, origen: 'aviso' } })
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
      <button
        type="button"
        className="nudge-close"
        aria-label="Cerrar"
        onClick={() => {
          events.track('suggestion_dismissed', { payload: { from: nudge.tag, to: nudge.complement, origen: 'aviso' } })
          dismiss()
        }}
      >
        ×
      </button>
    </div>
  )
}
