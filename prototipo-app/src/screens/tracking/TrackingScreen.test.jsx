import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ToastProvider } from '../../components/Toast'
import { AssistantProvider } from '../../state/AssistantContext'
import { DemoProvider } from '../../state/DemoContext'
import { OrdersProvider, useOrders } from '../../state/OrdersContext'
import TrackingScreen from './TrackingScreen'

const ORDER = {
  stores: ['Unimarc'],
  items: [{ name: 'Palta', img: 'palta.webp', price: '$1.000', qty: 1 }],
  total: 1000,
}

function Harness({ reset }) {
  const orders = useOrders()
  const order = orders.orders[0]
  if (!order)
    return (
      <button type="button" onClick={() => orders.place(ORDER)}>
        pedir
      </button>
    )
  return <TrackingScreen back={() => {}} reset={reset} params={{ orderId: order.id }} />
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
})

const renderTracking = (reset = vi.fn()) =>
  render(
    <DemoProvider>
      <AssistantProvider>
        <OrdersProvider>
          <ToastProvider>
            <Harness reset={reset} />
          </ToastProvider>
        </OrdersProvider>
      </AssistantProvider>
    </DemoProvider>,
  )

const deliver = () => {
  fireEvent.click(screen.getByText('pedir'))
  act(() => vi.advanceTimersByTime(21_000))
}

describe('TrackingScreen', () => {
  test('al entregar aparece «Volver al inicio», que reinicia la pila', () => {
    const reset = vi.fn()
    renderTracking(reset)
    fireEvent.click(screen.getByText('pedir'))
    expect(screen.queryByText('Volver al inicio')).toBeNull()
    act(() => vi.advanceTimersByTime(21_000))
    fireEvent.click(screen.getByText('Volver al inicio'))
    expect(reset).toHaveBeenCalled()
  })

  test('en el prototipo final, al entregar Bigotes ofrece armar el próximo pedido', () => {
    renderTracking()
    deliver()
    expect(screen.getByText('Bigotes te arma el próximo pedido')).toBeTruthy()
  })

  test('en «Rappi hoy», al entregar no hay oferta de Bigotes', () => {
    localStorage.setItem('rappi-proto-demo-mode', 'actual')
    renderTracking()
    deliver()
    expect(screen.queryByText('Bigotes te arma el próximo pedido')).toBeNull()
  })
})
