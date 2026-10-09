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

describe('TrackingScreen', () => {
  test('al entregar aparece «Volver al inicio», que reinicia la pila', () => {
    const reset = vi.fn()
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
    fireEvent.click(screen.getByText('pedir'))
    expect(screen.queryByText('Volver al inicio')).toBeNull()
    act(() => vi.advanceTimersByTime(21_000))
    fireEvent.click(screen.getByText('Volver al inicio'))
    expect(reset).toHaveBeenCalled()
  })
})
