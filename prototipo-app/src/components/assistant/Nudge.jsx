import { useEffect, useRef } from 'react'
import { TAG_TO_CONCEPT } from '../../api/orders'
import { TAGS, productsForTags } from '../../assistant/tags'
import { rectInPhone, useAssistant } from '../../state/AssistantContext'
import { useEvents } from '../../state/EventsContext'
import { useNudge } from '../../state/NudgeContext'
import Mascot from './Mascot'
import './nudge.css'

/** Concepto y vertical de lo sugerido (el panel une sugerencias y pedidos por ambos). */
const suggestionFields = (nudge) => ({
  concept_id: TAG_TO_CONCEPT[nudge.complement],
  vertical: productsForTags([nudge.complement], 1)[0]?.vertical,
  payload: { from: nudge.tag, to: nudge.complement, origen: 'aviso' },
})

/** Burbuja de Bigotes sobre la barra del carrito: "¿Te tinca sumar 🍿 snacks?" → abre el chat con esa búsqueda. */
export default function Nudge({ raised }) {
  const { nudge, dismiss } = useNudge()
  const assistant = useAssistant()
  const events = useEvents()
  const ref = useRef(null)
  const shownId = useRef(null)
  const visible = Boolean(nudge) && !assistant.isOpen

  // Una vez por aviso: abrir y cerrar el chat con el aviso vigente no lo cuenta de nuevo.
  useEffect(() => {
    if (!visible || shownId.current === nudge.id) return
    shownId.current = nudge.id
    events.track('suggestion_shown', suggestionFields(nudge))
  }, [visible, nudge, events])

  if (!visible) return null

  const from = TAGS[nudge.tag]
  const to = TAGS[nudge.complement]

  const open = () => {
    events.track('suggestion_accepted', suggestionFields(nudge))
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
          events.track('suggestion_dismissed', suggestionFields(nudge))
          dismiss()
        }}
      >
        ×
      </button>
    </div>
  )
}
