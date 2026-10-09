import { cartEventFields, conceptOf } from '../api/orders'
import { firstShowing } from '../api/useRemoteForYou'
import { productTags } from '../assistant/tags'
import { rememberAdded } from '../state/liveMemory'
import { useCart } from '../state/CartContext'
import { useEvents } from '../state/EventsContext'
import { WEIGHTS, useProfile } from '../state/ProfileContext'
import { useAssistant } from '../state/AssistantContext'
import { useDemo } from '../state/DemoContext'
import { useNudge } from '../state/NudgeContext'

// Sugerencias ya aceptadas, por generación del perfil (generación|concepto|vertical|origen): una vez por pestaña, como
// se cuenta la mostrada (firstShowing), así las aceptadas nunca superan a las mostradas, ni con un carro nuevo tras un
// pedido. «Olvidar» borra los eventos en el servidor, y lo que se acepte después vuelve a contar.
const accepted = new Set()

/**
 * Agregar y quitar una unidad del carrito con todo lo que eso implica (perfil, eventos, aviso de Bigotes).
 * Lo usan el botón "+" de los productos y la hoja de producto.
 */
export function useAddToCart() {
  const cart = useCart()
  const profile = useProfile()
  const demo = useDemo()
  const nudge = useNudge()
  const assistant = useAssistant()
  const events = useEvents()
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

  const remove = (item) => {
    cart.remove(item)
    cartEvent('cart_remove', item)
  }

  return { add, remove, qtyOf: cart.qtyOf }
}
