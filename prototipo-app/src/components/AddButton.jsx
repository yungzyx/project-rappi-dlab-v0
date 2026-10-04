import { cartEventFields, conceptOf } from '../api/orders'
import { productTags } from '../assistant/tags'
import { useCart } from '../state/CartContext'
import { useEvents } from '../state/EventsContext'
import { WEIGHTS, useProfile } from '../state/ProfileContext'
import { useAssistant } from '../state/AssistantContext'
import { useDemo } from '../state/DemoContext'
import { useNudge } from '../state/NudgeContext'
import { pressable } from './pressable'
import './add-button.css'

// Sugerencias ya aceptadas, por carro y generación del perfil (carro|generación|concepto|vertical|origen): «Olvidar»
// borra los eventos en el servidor, y lo que se acepte después vuelve a contar. Viven lo que la pestaña, como el carro.
const accepted = new Set()

/** Botón verde "+" de los productos. Con unidades en el carrito se abre como contador "− 2 +". */
export default function AddButton({ product, className = '' }) {
  const cart = useCart()
  const profile = useProfile()
  const demo = useDemo()
  const nudge = useNudge()
  const assistant = useAssistant()
  const events = useEvents()
  const qty = cart.qtyOf(product)
  const cartEvent = (type, item) => events.track(type, cartEventFields(item, cart.id))
  const add = (item) => {
    cart.add(item)
    profile.trackTags(productTags(item), WEIGHTS.cart)
    cartEvent('cart_add', item)
    // Aceptar una sugerencia es agregarla por primera vez en el carro: los "+" siguientes son solo cantidad, y
    // quitarla y volver a agregarla tampoco es otra aceptación (salvo que entre medio se haya tocado «Olvidar»).
    const origin = item.suggestionOrigin ?? 'chat'
    const concept = conceptOf(item) // los del cerebro local no traen concepto: sale de sus temas
    const key = `${cart.id}|${profile.resets}|${concept}|${item.vertical}|${origin}`
    if (item.fromSuggestion && !accepted.has(key)) {
      accepted.add(key)
      events.track('suggestion_accepted', {
        concept_id: concept,
        vertical: item.vertical,
        payload: { origen: origin },
      })
    }
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
