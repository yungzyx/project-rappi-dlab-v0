import { useEffect } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { productTags } from '../../assistant/tags'
import { ALL_PRODUCTS } from '../../data/catalog'
import { CartProvider, useCart } from '../../state/CartContext'
import { DemoProvider } from '../../state/DemoContext'
import { ProfileProvider } from '../../state/ProfileContext'
import CheckoutSuggestion, { checkoutSuggestion } from './CheckoutSuggestion'

const events = vi.hoisted(() => ({ track: vi.fn(), flush: async () => {}, clear: () => {}, settled: async () => {} }))
vi.mock('../../state/EventsContext', async (importOriginal) => ({ ...(await importOriginal()), useEvents: () => events }))

const BEER = ALL_PRODUCTS.find((product) => product.vertical === 'liquor' && productTags(product).includes('cerveza'))
const PHARMACY = ALL_PRODUCTS.find((product) => productTags(product).includes('farmacia'))

const probe = {}
function Probe() {
  const cart = useCart()
  useEffect(() => {
    probe.cart = cart
  })
  return null
}
const renderCheckout = (products = [BEER]) => {
  const view = render(
    <DemoProvider>
      <ProfileProvider>
        <CartProvider>
          <Probe />
          <CheckoutSuggestion />
        </CartProvider>
      </ProfileProvider>
    </DemoProvider>,
  )
  act(() => products.forEach((product) => probe.cart.add(product)))
  return view
}
const ask = () => fireEvent.click(screen.getByRole('button', { name: '¿Me falta algo? Pregúntale a Mochi' }))
const shownAtCheckout = () =>
  events.track.mock.calls.filter(([type, fields]) => type === 'suggestion_shown' && fields.payload?.origen === 'checkout')

beforeEach(() => localStorage.setItem('rappi-proto-demo-mode', 'final'))
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('«¿Me falta algo?» en el checkout (solo si se pide)', () => {
  // Primero: lo mostrado se recuerda lo que dura la pestaña (este archivo).
  test('pedirla registra suggestion_shown con origen checkout, una sola vez', () => {
    renderCheckout()
    ask()
    expect(shownAtCheckout()).toHaveLength(1)
    cleanup()
    renderCheckout()
    ask()
    expect(shownAtCheckout()).toHaveLength(1)
  })

  test('al principio solo está el botón; al tocarlo sugiere algo de otra vertical que combina, con la razón', () => {
    renderCheckout()
    expect(document.querySelector('.checkout-suggestion')).toBeNull()
    ask()
    const card = document.querySelector('.checkout-suggestion')
    expect(card.querySelector('.checkout-suggestion-reason').textContent).toMatch(/^Llevas 🍺 Cerveza → \S+ \S/)
    expect(card.querySelector('.mochi')).toBeTruthy()
    expect(checkoutSuggestion([{ product: BEER, qty: 1 }]).product.vertical).not.toBe('liquor')
  })

  test('agregarla la suma al carro con «Deshacer», que la quita', () => {
    renderCheckout()
    ask()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    expect(probe.cart.count).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(probe.cart.count).toBe(1)
  })

  test('nunca sugiere algo que ya está en el carro', () => {
    const first = checkoutSuggestion([{ product: BEER, qty: 1 }]).product
    const next = checkoutSuggestion([
      { product: BEER, qty: 1 },
      { product: first, qty: 1 },
    ])
    expect(next?.product.id).not.toBe(first.id)
  })

  test('con solo productos de farmacia no sugiere nada (ni ofrece el botón)', () => {
    expect(checkoutSuggestion([{ product: PHARMACY, qty: 1 }])).toBeNull()
    renderCheckout([PHARMACY])
    expect(screen.queryByRole('button', { name: '¿Me falta algo? Pregúntale a Mochi' })).toBeNull()
  })

  test('en «Rappi hoy» no aparece', () => {
    localStorage.setItem('rappi-proto-demo-mode', 'actual')
    renderCheckout()
    expect(screen.queryByRole('button', { name: '¿Me falta algo? Pregúntale a Mochi' })).toBeNull()
  })
})
