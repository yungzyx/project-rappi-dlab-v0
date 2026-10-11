import { useId, useState } from 'react'
import './offer-why.css'

/**
 * «¿Por qué?» de una oferta del agente: un botón que despliega la razón que trae la API (`reason.text`). Sin texto no
 * pinta nada: una oferta sin razón se muestra como antes.
 */
export default function OfferWhy({ reason }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  if (!reason?.text) return null
  return (
    <div className="offer-why">
      <button
        type="button"
        className="offer-why-toggle tap"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        ¿Por qué?
      </button>
      {open && (
        <span id={id} className="offer-why-text">
          {reason.text}
        </span>
      )}
    </div>
  )
}
