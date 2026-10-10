import { cartEventFields, conceptOf } from '../api/orders'
import { firstShowing } from '../api/useRemoteForYou'
import { productTags } from '../assistant/tags'
import { MOCHI_CART_EVENT, rememberAdded, session } from '../state/liveMemory'
import { lineKey, useCart } from '../state/CartContext'
import { useEvents } from '../state/EventsContext'
import { WEIGHTS, useProfile } from '../state/ProfileContext'
import { useDemo } from '../state/DemoContext'

// Sugerencias ya aceptadas, por generación del perfil (generación|concepto|vertical|origen): una vez por pestaña, como
// se cuenta la mostrada (firstShowing), así las aceptadas nunca superan a las mostradas, ni con un carro nuevo tras un
// pedido. «Olvidar» borra los eventos en el servidor, y lo que se acepte después vuelve a contar.
const accepted = new Set()

/**
 * Agregar y quitar una unidad del carrito con todo lo que eso implica (perfil, eventos, memoria de Mochi).
 * Lo usan el botón "+" de los productos y la hoja de producto.
 */
export function useAddToCart() {
  const cart = useCart()
  const profile = useProfile()
  const demo = useDemo()
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
    // En el prototipo final no hay aviso del carro: Mochi flotante lo confirma (con «Deshacer») y, si combina con
    // algo de otra vertical, lo comenta al volver a la Home.
    if (demo.isFinal) {
      rememberAdded(item)
      window.dispatchEvent(new CustomEvent(MOCHI_CART_EVENT, { detail: { product: item } }))
    }
  }

  const remove = (item) => {
    const lastUnit = cart.qtyOf(item) <= 1
    cart.remove(item)
    cartEvent('cart_remove', item)
    // Lo que sale del carro (o se deshace) ya no es «lo último agregado»: Mochi no lo comenta al volver a la Home.
    if (lastUnit && session.lastAdded && lineKey(session.lastAdded) === lineKey(item)) session.lastAdded = null
  }

  return { add, remove, qtyOf: cart.qtyOf }
}
