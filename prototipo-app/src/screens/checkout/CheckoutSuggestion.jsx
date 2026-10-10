import { useState } from 'react'
import { conceptOf } from '../../api/orders'
import { firstShowing } from '../../api/useRemoteForYou'
import { NEVER_SUGGESTED, TAGS, isAlcohol, productTags } from '../../assistant/tags'
import Mascot from '../../components/assistant/Mascot'
import { useAddToCart } from '../../hooks/useAddToCart'
import { lineKey, useCart } from '../../state/CartContext'
import { useDemo } from '../../state/DemoContext'
import { useEvents } from '../../state/EventsContext'
import { useProfile } from '../../state/ProfileContext'
import { discoveryFor } from '../home/live/script'

/**
 * Lo que combina con el carro, de otra vertical: el primer tema de una línea que tenga complemento (como la Home al
 * volver) y su primer producto que no esté ya en el carro. Nada sensible (NEVER_SUGGESTED, y discoveryFor lo cuida).
 */
export function checkoutSuggestion(items) {
  const inCart = new Set(items.map(({ product }) => lineKey(product)))
  for (const { product } of items) {
    for (const tag of productTags(product)) {
      if (!TAGS[tag] || NEVER_SUGGESTED.has(tag)) continue
      const found = discoveryFor({ tag, vertical: product.vertical })
      const pick = found?.items.find((item) => item.kind === 'product' && !inCart.has(lineKey(item.product)))
      if (pick)
        return {
          from: { label: TAGS[tag].label, emoji: TAGS[tag].emoji },
          to: { label: found.label, emoji: found.emoji, vertical: found.vertical, verticalName: found.verticalName },
          product: pick.product,
        }
    }
  }
  return null
}

/**
 * «¿Me falta algo?» en el checkout (prototipo final): solo si la persona lo pide, Mochi sugiere UNA cosa de otra
 * vertical, con su razón, «Agregar» y «Deshacer». Nada aparece por su cuenta.
 */
export default function CheckoutSuggestion() {
  const demo = useDemo()
  const cart = useCart()
  const profile = useProfile()
  const events = useEvents()
  const { add, remove } = useAddToCart()
  const [picked, setPicked] = useState(null) // la sugerencia pedida: queda fija aunque cambie el carro
  const [added, setAdded] = useState(null)

  if (!demo?.isFinal) return null
  if (!picked) {
    if (!checkoutSuggestion(cart.items)) return null
    const ask = () => {
      const suggestion = checkoutSuggestion(cart.items)
      setPicked(suggestion)
      const { product } = suggestion
      const concept = conceptOf(product)
      if (firstShowing({ concept, vertical: product.vertical, origin: 'checkout', generation: profile.resets }))
        events.track('suggestion_shown', { concept_id: concept, vertical: product.vertical, payload: { origen: 'checkout' } })
    }
    return (
      <button type="button" className="checkout-ask tap" onClick={ask}>
        <Mascot size={28} badge />
        ¿Me falta algo? Pregúntale a Mochi
      </button>
    )
  }

  const { from, to, product } = picked
  return (
    <section className="checkout-suggestion" aria-label="Sugerencia de Mochi">
      <Mascot size={40} badge mood="wave" />
      <div className="checkout-suggestion-body">
        <p className="checkout-suggestion-reason">
          Llevas {from.emoji} {from.label} → {to.emoji} {to.label}
        </p>
        <p className="checkout-suggestion-product">
          {product.name} · {product.price} · {to.verticalName}
          {isAlcohol(product) && (
            <span className="checkout-suggestion-age" aria-label="Solo mayores de 18">
              +18
            </span>
          )}
        </p>
        {added ? (
          <button
            type="button"
            className="checkout-suggestion-action tap"
            onClick={() => {
              remove(added)
              setAdded(null)
            }}
          >
            Deshacer
          </button>
        ) : (
          <button
            type="button"
            className="checkout-suggestion-action is-primary tap"
            onClick={() => {
              const item = { ...product, fromSuggestion: true, suggestionOrigin: 'checkout' }
              add(item)
              setAdded(item)
            }}
          >
            Agregar
          </button>
        )}
      </div>
    </section>
  )
}
