import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ToastProvider } from '../../components/Toast'
import { AssistantProvider } from '../../state/AssistantContext'
import { DemoProvider } from '../../state/DemoContext'
import { GameProvider } from '../../state/GameContext'
import { OrdersProvider, useOrders } from '../../state/OrdersContext'
import TrackingScreen from './TrackingScreen'

const ORDER = {
  stores: ['Unimarc'],
  items: [{ name: 'Palta', img: 'palta.webp', price: '$1.000', qty: 1 }],
  total: 1000,
}

function Harness({ reset, push }) {
  const orders = useOrders()
  const order = orders.orders[0]
  if (!order)
    return (
      <button type="button" onClick={() => orders.place(ORDER)}>
        pedir
      </button>
    )
  return <TrackingScreen back={() => {}} reset={reset} push={push} params={{ orderId: order.id }} />
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
})

const renderTracking = (reset = vi.fn(), push = vi.fn()) =>
  render(
    <DemoProvider>
      <AssistantProvider>
        <OrdersProvider>
          <GameProvider>
            <ToastProvider>
              <Harness reset={reset} push={push} />
            </ToastProvider>
          </GameProvider>
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

  test('en el prototipo final, al entregar Mochi ofrece armar el próximo pedido', () => {
    renderTracking()
    deliver()
    expect(screen.getByText('Mochi te arma el próximo pedido')).toBeTruthy()
  })

  test('en «Rappi hoy», al entregar no hay oferta de Mochi', () => {
    localStorage.setItem('rappi-proto-demo-mode', 'actual')
    renderTracking()
    deliver()
    expect(screen.queryByText('Mochi te arma el próximo pedido')).toBeNull()
  })

  test('en «Rappi hoy» el mapa queda como antes: Mochi de frente y sin «¡Ya casi!»', () => {
    localStorage.setItem('rappi-proto-demo-mode', 'actual')
    renderTracking()
    fireEvent.click(screen.getByText('pedir'))
    const image = () => document.querySelector('.tracking-rider image')
    act(() => vi.advanceTimersByTime(1_000)) // preparando
    expect(image().getAttribute('y')).toBe('0')
    act(() => vi.advanceTimersByTime(17_500)) // tramo final de la ruta
    expect(image().getAttribute('x')).toBe('0')
    expect(document.querySelector('.tracking-almost')).toBeNull()
  })

  test('en el prototipo final, preparando, Mochi está tímido', () => {
    renderTracking()
    fireEvent.click(screen.getByText('pedir'))
    act(() => vi.advanceTimersByTime(1_000))
    expect(document.querySelector('.tracking-rider image').getAttribute('y')).toBe('-1')
  })

  describe('jugar mientras llega el pedido', () => {
    test('ofrece una ronda de la primera vertical sin sello (Express) y la abre con el pedido', () => {
      const push = vi.fn()
      renderTracking(vi.fn(), push)
      fireEvent.click(screen.getByText('pedir'))
      const card = screen.getByRole('button', { name: /Juega mientras llega tu pedido/ })
      expect(card.textContent).toMatch(/gana el sello de Express/)
      fireEvent.click(card)
      expect(push).toHaveBeenCalledWith('game', { round: 'conveniencia', orderId: expect.stringMatching(/^order-/) })
    })

    test('al entregar, la tarjeta ya no está', () => {
      renderTracking()
      deliver()
      expect(screen.queryByRole('button', { name: /Juega mientras llega tu pedido/ })).toBeNull()
    })

    test('en «Rappi hoy» no se ofrece', () => {
      localStorage.setItem('rappi-proto-demo-mode', 'actual')
      renderTracking()
      fireEvent.click(screen.getByText('pedir'))
      expect(screen.queryByRole('button', { name: /Juega mientras llega tu pedido/ })).toBeNull()
    })
  })
})
