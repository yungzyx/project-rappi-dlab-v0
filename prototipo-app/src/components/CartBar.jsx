import { useState } from 'react'
import { formatPrice, parsePrice, useCart } from '../state/CartContext'
import AddButton from './AddButton'
import Sheet from './Sheet'
import './cart.css'

/** Barra flotante "View cart" (aparece con productos) y la hoja con el detalle del carrito. */
export default function CartBar({ raised, push }) {
  const cart = useCart()
  const [open, setOpen] = useState(false)

  if (cart.count === 0 && !open) return null

  const checkout = () => {
    setOpen(false)
    push('checkout')
  }

  return (
    <>
      {cart.count > 0 && (
        <button
          type="button"
          className={raised ? 'cart-bar is-raised tap' : 'cart-bar tap'}
          onClick={() => setOpen(true)}
        >
          <span className="cart-bar-count">{cart.count}</span>
          View cart
          <span className="cart-bar-total">{formatPrice(cart.total)}</span>
        </button>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Your cart">
        {cart.items.length === 0 ? (
          <p className="cart-empty">Your cart is empty.</p>
        ) : (
          <>
            <ul className="cart-lines">
              {cart.items.map(({ product, qty }) => (
                <li key={product.id} className="cart-line">
                  <img src={product.img} alt="" />
                  <span className="cart-line-text">
                    <strong>{product.name}</strong>
                    <span>{product.store}</span>
                    <span className="cart-line-price">{formatPrice(parsePrice(product.price) * qty)}</span>
                  </span>
                  <span className="cart-line-stepper">
                    <AddButton product={product} />
                  </span>
                </li>
              ))}
            </ul>
            <div className="cart-summary">
              <span>Subtotal</span>
              <strong>{formatPrice(cart.total)}</strong>
            </div>
            <button type="button" className="cart-checkout tap" onClick={checkout}>
              Go to checkout
            </button>
            <button type="button" className="cart-clear" onClick={cart.clear}>
              Empty cart
            </button>
          </>
        )}
      </Sheet>
    </>
  )
}
