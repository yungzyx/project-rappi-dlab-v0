import { cartEventFields, conceptOf } from '../api/orders'
import { firstShowing } from '../api/useRemoteForYou'
import { productTags } from '../assistant/tags'
import { rememberAdded } from '../screens/home/live/memory'
import { useCart } from '../state/CartContext'
import { useEvents } from '../state/EventsContext'
import { WEIGHTS, useProfile } from '../state/ProfileContext'
import { useAssistant } from '../state/AssistantContext'
import { useDemo } from '../state/DemoContext'
import { useNudge } from '../state/NudgeContext'
import { pressable } from './pressable'
import './add-button.css'

// Sugerencias ya aceptadas, por generación del perfil (generación|concepto|vertical|origen): una vez por pestaña, como
// se cuenta la mostrada (firstShowing), así las aceptadas nunca superan a las mostradas, ni con un carro nuevo tras un
// pedido. «Olvidar» borra los eventos en el servidor, y lo que se acepte después vuelve a contar.
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
    // Aceptar una sugerencia es agregarla por primera vez: los "+" siguientes son solo cantidad, y quitarla y volver a
    // agregarla tampoco es otra aceptación (salvo que entre medio se haya tocado «Olvidar»).
    const origin = item.suggestionOrigin ?? 'chat'
    const concept = conceptOf(item) // los del cerebro local no traen concepto: sale de sus temas
    const key = `${profile.resets}|${concept}|${item.vertical}|${origin}`
    if (item.fromSuggestion && !accepted.has(key)) {
      accepted.add(key)
      const fields = { concept_id: concept, vertical: item.vertical, payload: { origen: origin } }
      // Lo aceptado siempre tiene su mostrada: la fila local de la Home no la registra mientras espera la de rappi-ia
      // (es provisoria), pero su «+» ya funciona.
      if (firstShowing({ concept, vertical: item.vertical, origin, generation: profile.resets }))
        events.track('suggestion_shown', fields)
      events.track('suggestion_accepted', fields)
    }
    // En «Bigotes vivo» no hay aviso ni chat: Bigotes lo comenta al volver a la Home.
    if (demo.isLive) rememberAdded(item)
    // Dentro del chat Bigotes ya está recomendando: el aviso solo sale fuera.
    else if (demo.isProposal && !assistant.isOpen) nudge.offer(item)
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
