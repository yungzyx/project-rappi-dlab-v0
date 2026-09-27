import { useCart } from '../state/CartContext'
import { WEIGHTS, useProfile } from '../state/ProfileContext'
import { useAssistant } from '../state/AssistantContext'
import { useDemo } from '../state/DemoContext'
import { useNudge } from '../state/NudgeContext'
import './add-button.css'

/** Botón verde "+" de los productos. Con unidades en el carrito se abre como contador "− 2 +". */
export default function AddButton({ product, className = '' }) {
  const cart = useCart()
  const profile = useProfile()
  const demo = useDemo()
  const nudge = useNudge()
  const assistant = useAssistant()
  const qty = cart.qtyOf(product.id)
  const add = (item) => {
    cart.add(item)
    profile.track(`${item.name} ${item.store ?? ''}`, WEIGHTS.cart)
    // Dentro del chat Bigotes ya está recomendando: el aviso solo sale fuera.
    if (demo.isProposal && !assistant.isOpen) nudge.offer(item)
  }

  const stop = (handler) => (e) => {
    e.stopPropagation()
    handler(product)
  }

  if (qty === 0) {
    return (
      <span
        role="button"
        tabIndex={0}
        className={`add-button ${className}`}
        aria-label={`Agregar ${product.name}`}
        onClick={stop(add)}
        onKeyDown={(e) => e.key === 'Enter' && stop(add)(e)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v16M4 12h16" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
        </svg>
      </span>
    )
  }

  return (
    <span className={`add-button is-open ${className}`}>
      <span role="button" tabIndex={0} aria-label="Quitar uno" onClick={stop(cart.remove)}>
        −
      </span>
      <strong aria-live="polite">{qty}</strong>
      <span role="button" tabIndex={0} aria-label="Agregar uno" onClick={stop(add)}>
        +
      </span>
    </span>
  )
}
