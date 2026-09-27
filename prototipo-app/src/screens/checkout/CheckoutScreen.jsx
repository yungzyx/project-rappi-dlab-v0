import { useState } from 'react'
import { health, sendOrder } from '../../api/client'
import { buildOrders } from '../../api/orders'
import ProductRow from '../../components/ProductRow'
import { useToast } from '../../components/Toast'
import { ChevronLeft, ChevronRight } from '../../components/Icons'
import { CardIcon, PinIcon } from '../../components/LineIcons'
import { useAddress } from '../../state/AddressContext'
import { sessionId, useEvents, userId } from '../../state/EventsContext'
import { formatPrice, useCart } from '../../state/CartContext'
import { useOrders } from '../../state/OrdersContext'
import { DEFAULT_TIP, TIPS, priceBreakdown } from './pricing'
import './checkout.css'

const MODES = ['Delivery', 'Pickup']

/** Checkout (funcionalidad agregada). El medio de pago es solo un texto de ejemplo: no se ingresan datos. */
export default function CheckoutScreen({ back, push }) {
  const cart = useCart()
  const address = useAddress()
  const orders = useOrders()
  const toast = useToast()
  const events = useEvents()
  const [mode, setMode] = useState(MODES[0])
  const [tip, setTip] = useState(DEFAULT_TIP)
  const pickup = mode === 'Pickup'
  const price = priceBreakdown({ subtotal: cart.total, tip, pickup })
  const stores = [...new Set(cart.items.map(({ product }) => product.store).filter(Boolean))]

  const placeOrder = () => {
    events.track('checkout_start', { cart_id: cart.id, value: price.total })
    const pending = buildOrders(cart.items, { userId: userId(), sessionId: sessionId(), cartId: cart.id })
    // Registro para el panel (si la API está arriba). No bloquea el pedido de la demo.
    health().then((online) => online && pending.forEach((order) => sendOrder(order).catch(() => {})))
    const id = orders.place({
      stores,
      items: cart.items.map(({ product, qty }) => ({
        name: product.name,
        img: product.img,
        price: product.price,
        qty,
      })),
      total: price.total,
      pickup,
      address: address.selected.line,
    })
    cart.clear()
    // El seguimiento reemplaza al checkout en el historial: "volver" desde ahí no regresa a un carrito vacío.
    push('tracking', { orderId: id }, { swap: true })
  }

  if (cart.count === 0) {
    return (
      <div className="screen checkout">
        <CheckoutHeader back={back} />
        <p className="checkout-empty">Your cart is empty.</p>
      </div>
    )
  }

  return (
    <>
      <div className="screen checkout">
        <CheckoutHeader back={back} />

        <div className="checkout-modes" role="tablist">
          {MODES.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={option === mode}
              className={option === mode ? 'checkout-mode is-active' : 'checkout-mode'}
              onClick={() => setMode(option)}
            >
              {option}
            </button>
          ))}
        </div>

        <button type="button" className="checkout-card tap" onClick={address.openSheet}>
          <PinIcon size={24} />
          <span>
            <strong>{pickup ? 'Pick up at the store' : address.selected.label}</strong>
            <small>{pickup ? stores.join(', ') : address.selected.line}</small>
          </span>
          <ChevronRight size={18} />
        </button>
        <p className="checkout-eta">{pickup ? 'Ready in 15–20 min' : 'Arrives in 25–35 min'}</p>

        <h2 className="checkout-title">Your order</h2>
        <ul className="checkout-items">
          {cart.items.map(({ product }) => (
            <ProductRow key={product.id} product={product} showStore />
          ))}
        </ul>

        {!pickup && (
          <>
            <h2 className="checkout-title">Tip for your Rappitendero</h2>
            <div className="checkout-tips">
              {TIPS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  className={amount === tip ? 'checkout-tip is-active' : 'checkout-tip'}
                  aria-pressed={amount === tip}
                  onClick={() => setTip(amount)}
                >
                  {amount === 0 ? 'No tip' : formatPrice(amount)}
                </button>
              ))}
            </div>
          </>
        )}

        <h2 className="checkout-title">Payment method</h2>
        <button type="button" className="checkout-card tap" onClick={() => toast('Medio de pago de ejemplo')}>
          <CardIcon size={24} />
          <span>
            <strong>Visa •••• 4242</strong>
            <small>Demo card</small>
          </span>
          <span className="checkout-change">Change</span>
        </button>

        <dl className="checkout-summary">
          <SummaryRow label="Subtotal" value={formatPrice(price.subtotal)} />
          {!pickup && (
            <SummaryRow
              label="Delivery"
              value={price.delivery === 0 ? 'Free with Pro' : formatPrice(price.delivery)}
              accent={price.delivery === 0}
            />
          )}
          <SummaryRow label="Service fee" value={formatPrice(price.service)} />
          {!pickup && <SummaryRow label="Tip" value={formatPrice(price.tip)} />}
          <SummaryRow label="Total" value={formatPrice(price.total)} total />
        </dl>
      </div>

      {/* Fuera del contenedor con scroll para que quede fijo abajo */}
      <div className="checkout-footer">
        <button type="button" className="checkout-place tap" onClick={placeOrder}>
          Place order · {formatPrice(price.total)}
        </button>
      </div>
    </>
  )
}

function CheckoutHeader({ back }) {
  return (
    <header className="checkout-header">
      <button type="button" className="round-button tap" aria-label="Volver" onClick={back}>
        <ChevronLeft size={20} />
      </button>
      <h1>Checkout</h1>
    </header>
  )
}

function SummaryRow({ label, value, accent = false, total = false }) {
  return (
    <div className={total ? 'checkout-row is-total' : 'checkout-row'}>
      <dt>{label}</dt>
      <dd className={accent ? 'is-accent' : undefined}>{value}</dd>
    </div>
  )
}
