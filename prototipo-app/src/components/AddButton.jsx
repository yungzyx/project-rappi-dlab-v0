import { conceptOf } from '../api/orders'
import { productTags } from '../assistant/tags'
import { parsePrice, useCart } from '../state/CartContext'
import { useEvents } from '../state/EventsContext'
import { WEIGHTS, useProfile } from '../state/ProfileContext'
import { useAssistant } from '../state/AssistantContext'
import { useDemo } from '../state/DemoContext'
import { useNudge } from '../state/NudgeContext'
import { pressable } from './pressable'
import './add-button.css'

/** Botón verde "+" de los productos. Con unidades en el carrito se abre como contador "− 2 +". */
export default function AddButton({ product, className = '' }) {
  const cart = useCart()
  const profile = useProfile()
  const demo = useDemo()
  const nudge = useNudge()
  const assistant = useAssistant()
  const events = useEvents()
  const qty = cart.qtyOf(product)
  const cartEvent = (type, item) =>
    events.track(type, {
      cart_id: cart.id,
      vertical: item.vertical,
      concept_id: conceptOf(item),
      entity_type: item.entityType,
      entity_id: item.entityId,
      value: parsePrice(item.price) || undefined,
      payload: item.fromSuggestion ? { from_suggestion: true } : {},
    })
  const add = (item) => {
    const first = cart.qtyOf(item) === 0
    cart.add(item)
    profile.trackTags(productTags(item), WEIGHTS.cart)
    cartEvent('cart_add', item)
    // Aceptar una sugerencia es agregarla por primera vez; los "+" siguientes son solo cantidad.
    if (item.fromSuggestion && first)
      events.track('suggestion_accepted', {
        concept_id: item.concept,
        vertical: item.vertical,
        payload: { origen: item.suggestionOrigin ?? 'chat' },
      })
    // Dentro del chat Bigotes ya está recomendando: el aviso solo sale fuera.
    if (demo.isProposal && !assistant.isOpen) nudge.offer(item)
  }

  const stop = (handler) => (e) => {
    e.stopPropagation()
    handler(product)
  }

  if (qty === 0) {
    return (
      <span className={`add-button ${className}`} aria-label={`Agregar ${product.name}`} {...pressable(stop(add))}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v16M4 12h16" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
        </svg>
      </span>
    )
  }

  return (
    <span className={`add-button is-open ${className}`}>
      <span
        aria-label="Quitar uno"
        {...pressable(
          stop((item) => {
            cart.remove(item)
            cartEvent('cart_remove', item)
          }),
        )}
      >
        −
      </span>
      <strong aria-live="polite">{qty}</strong>
      <span aria-label="Agregar uno" {...pressable(stop(add))}>
        +
      </span>
    </span>
  )
}
