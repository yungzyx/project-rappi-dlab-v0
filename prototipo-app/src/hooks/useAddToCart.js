import { cartEventFields } from '../api/orders'
import { noteAccepted } from '../api/suggestions'
import { MOCHI_CART_EVENT, rememberAdded, session } from '../state/liveMemory'
import { lineKey, useCart } from '../state/CartContext'
import { useEvents } from '../state/EventsContext'
import { useProfile } from '../state/ProfileContext'
import { useDemo } from '../state/DemoContext'

/**
 * Agregar y quitar una unidad del carrito con todo lo que eso implica (eventos, memoria de Mochi).
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
    cartEvent('cart_add', item)
    // Aceptar una sugerencia es agregarla por primera vez: los "+" siguientes son solo cantidad, y quitarla y volver a
    // agregarla tampoco es otra aceptación (salvo que entre medio se haya tocado «Olvidar»).
    if (item.fromSuggestion)
      noteAccepted(events.track, [item], { origin: item.suggestionOrigin ?? 'chat', generation: profile.resets })
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
