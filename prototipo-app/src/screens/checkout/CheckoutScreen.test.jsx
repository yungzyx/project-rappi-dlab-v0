import { StrictMode, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ToastProvider } from '../../components/Toast'
import { ALL_PRODUCTS } from '../../data/catalog'
import { AddressProvider } from '../../state/AddressContext'
import { AssistantProvider } from '../../state/AssistantContext'
import { CartProvider, useCart } from '../../state/CartContext'
import { DemoProvider } from '../../state/DemoContext'
import { NudgeProvider } from '../../state/NudgeContext'
import { OrdersProvider } from '../../state/OrdersContext'
import { ProfileProvider } from '../../state/ProfileContext'
import CheckoutScreen from './CheckoutScreen'

const api = vi.hoisted(() => ({ health: vi.fn(), sendOrder: vi.fn() }))
vi.mock('../../api/client', async (importOriginal) => ({ ...(await importOriginal()), ...api }))
const events = vi.hoisted(() => ({ track: vi.fn(), flush: async () => {}, clear: () => {}, settled: async () => {} }))
vi.mock('../../state/EventsContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useEvents: () => events,
}))

// Un producto de Licores y uno del Súper: el carro va en dos pedidos.
const BEER = ALL_PRODUCTS.find((product) => product.id === 'p-heineken')
const AVOCADO = ALL_PRODUCTS.find((product) => product.id === 'p-palta')

/** Llena el carro y abre el checkout, como al tocar la barra del carrito. */
function Harness() {
  const cart = useCart()
  const [open, setOpen] = useState(false)
  if (open) return <CheckoutScreen back={() => setOpen(false)} push={() => {}} />
  return (
    <button
      type="button"
      onClick={() => {
        cart.add(BEER)
        cart.add(AVOCADO)
        setOpen(true)
      }}
    >
      ir a pagar
    </button>
  )
}

function renderCheckout() {
  render(
    <StrictMode>
      <DemoProvider>
        <ProfileProvider>
          <AssistantProvider>
            <CartProvider>
              <OrdersProvider>
                <AddressProvider>
                  <ToastProvider>
                    <NudgeProvider>
                      <Harness />
                    </NudgeProvider>
                  </ToastProvider>
                </AddressProvider>
              </OrdersProvider>
            </CartProvider>
          </AssistantProvider>
        </ProfileProvider>
      </DemoProvider>
    </StrictMode>,
  )
  fireEvent.click(screen.getByText('ir a pagar'))
}

const checkoutStarts = () =>
  events.track.mock.calls.filter(([type]) => type === 'checkout_start').map(([, fields]) => fields)

beforeEach(() => {
  api.health.mockResolvedValue({ voz: false })
  api.sendOrder.mockResolvedValue({})
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  localStorage.clear()
})

describe('inicio de pago', () => {
  test('abrir el checkout ya es iniciar el pago: uno por vertical del carro, antes de «Place order»', () => {
    renderCheckout()
    const starts = checkoutStarts()
    expect(starts.map((fields) => fields.vertical).sort()).toEqual(['licores', 'supermercado'])
    expect(new Set(starts.map((fields) => fields.cart_id)).size).toBe(1)
  })

  test('volver sin pagar deja el inicio de pago y ningún pedido', () => {
    renderCheckout()
    fireEvent.click(screen.getByLabelText('Volver'))
    expect(checkoutStarts()).toHaveLength(2)
    expect(api.sendOrder).not.toHaveBeenCalled()
  })

  test('pagar no repite el inicio de pago', async () => {
    renderCheckout()
    fireEvent.click(screen.getByText(/Place order/))
    await vi.waitFor(() => expect(api.sendOrder).toHaveBeenCalledTimes(2))
    expect(checkoutStarts()).toHaveLength(2)
  })
})
