import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { gameChallenge, stubApi } from '../../api/testing'
import { initialState } from '../../game/progress.js'
import { makeRound } from '../../game/round.js'
import { gameReady, seed } from '../../game/testSeed.js'
import { GameProvider } from '../../state/GameContext'
import { OrdersProvider, useOrders } from '../../state/OrdersContext'
import GameScreen from './GameScreen'

const ORDER = { stores: ['Unimarc'], items: [{ name: 'Palta', img: 'palta.webp', price: '$1.000', qty: 1 }], total: 1000 }

/** Hace un pedido y abre el juego con una ronda directa, como desde el seguimiento. */
function Harness({ back, orderId }) {
  const orders = useOrders()
  const order = orders.orders[0]
  if (!order)
    return (
      <button type="button" onClick={() => orders.place(ORDER)}>
        pedir
      </button>
    )
  return <GameScreen back={back} push={() => {}} params={{ round: 'turbo', orderId: orderId ?? order.id }} />
}

const renderRound = async ({ back = vi.fn(), orderId } = {}) => {
  render(
    <OrdersProvider>
      <GameProvider>
        <Harness back={back} orderId={orderId} />
      </GameProvider>
    </OrdersProvider>,
  )
  await gameReady()
  fireEvent.click(screen.getByText('pedir'))
  // La ronda parte cuando llega su desafío de la API (sin adelantar el reloj fingido).
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  return back
}

beforeEach(() => {
  vi.useFakeTimers()
  stubApi({})
  seed()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('ronda mientras llega el pedido', () => {
  test('la franja dice cuánto falta y avisa cuando llega; «Ver pedido» vuelve al seguimiento', async () => {
    const back = await renderRound()
    expect(screen.getByRole('status').textContent).toMatch(/Tu pedido llega en \d+ min/)
    act(() => vi.advanceTimersByTime(21_000))
    expect(screen.getByRole('status').textContent).toMatch(/¡Tu pedido llegó!/)
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Ver pedido' }))
    expect(back).toHaveBeenCalled()
  })

  test('cuando llega el pedido, Mochi salta en el aviso del juego', async () => {
    await renderRound()
    expect(document.querySelector('.game-order .mascot')).toBeNull()
    act(() => vi.advanceTimersByTime(21_000))
    expect(document.querySelector('.game-order .mascot').classList).toContain('mascot--jump')
  })

  test('con un pedido que ya no existe no hay franja', async () => {
    await renderRound({ orderId: 'order-que-no-existe' })
    expect(screen.queryByRole('status')).toBeNull()
  })

  test('al terminar la ronda, el botón lleva de vuelta al pedido', async () => {
    const round = makeRound({ ...initialState(), visited: [] }, 'turbo', gameChallenge('turbo', '0'))
    const back = await renderRound()
    for (const step of round) {
      if (step.type === 'dato') fireEvent.click(screen.getByRole('button', { name: 'Dar vuelta' }))
      else {
        const label = step.challenge.options.find((o) => o.id === step.challenge.answer).label
        fireEvent.click(within(screen.getByRole('group', { name: 'Opciones' })).getByRole('button', { name: label }))
      }
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Volver a tu pedido' }))
    expect(back).toHaveBeenCalled()
  })
})
