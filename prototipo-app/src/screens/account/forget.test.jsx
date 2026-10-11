import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { stubApi } from '../../api/testing'
import { userId } from '../../api/user'
import { ToastProvider } from '../../components/Toast'
import { gameReady, seed } from '../../game/testSeed.js'
import { AddressProvider } from '../../state/AddressContext'
import { DemoProvider } from '../../state/DemoContext'
import { forgetAll } from '../../state/forgetAll'
import { GameProvider } from '../../state/GameContext'
import { OrdersProvider, useOrders } from '../../state/OrdersContext'
import { ProfileProvider } from '../../state/ProfileContext'
import AccountScreen from './AccountScreen'

const order = { id: 'order-1', placedAt: 1, stores: ['Súper'], items: [], total: 1000, address: 'Casa de prueba' }

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  seed()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function Orders() {
  return <p data-testid="orders">{useOrders().orders.length}</p>
}

async function renderAccount() {
  render(
    <DemoProvider>
      <ProfileProvider>
        <ToastProvider>
          <AddressProvider>
            <OrdersProvider>
              <GameProvider>
                <Orders />
                <AccountScreen onBack={() => {}} push={() => {}} />
              </GameProvider>
            </OrdersProvider>
          </AddressProvider>
        </ToastProvider>
      </ProfileProvider>
    </DemoProvider>,
  )
  await gameReady()
}

const deletes = (api) => api.mock.calls.filter(([, init]) => init?.method === 'DELETE').map(([url]) => new URL(url).pathname)

describe('Borrar mis datos (Cuenta)', () => {
  test('llama a forget, deja solo el id nuevo en el navegador y userId cambia', async () => {
    const before = userId()
    localStorage.setItem('rappi-proto-orders', JSON.stringify([order]))
    localStorage.setItem('rappi-proto-cart', '{"id":"c-1","lines":{}}')
    localStorage.setItem('rappi-proto-privacy-seen', '1')
    sessionStorage.setItem('rappi-proto-session', '{"id":"s-1","lastAt":1}')
    const api = stubApi({ 'DELETE /profile/*': {} })
    await renderAccount()
    expect(screen.getByTestId('orders').textContent).toBe('1')

    fireEvent.click(screen.getByRole('button', { name: 'Borrar mis datos' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sí, borrar' }))
    await waitFor(() => expect(deletes(api)).toEqual([`/profile/${before}`]))

    await waitFor(() => expect(userId()).not.toBe(before))
    const left = Object.keys(localStorage).filter((key) => key.startsWith('rappi-proto-'))
    expect(left).toEqual(['rappi-proto-user'])
    expect(localStorage.getItem('rappi-proto-user')).toBe(userId())
    expect(sessionStorage.getItem('rappi-proto-session')).toBeNull()
    // Los pedidos guardados con la dirección ya no se ven en pantalla.
    await waitFor(() => expect(screen.getByTestId('orders').textContent).toBe('0'))
  })

  test('si el servidor no borra, no se toca nada y se avisa', async () => {
    const before = userId()
    localStorage.setItem('rappi-proto-orders', JSON.stringify([order]))
    const api = stubApi({ 'DELETE /profile/*': 500 })
    await renderAccount()
    fireEvent.click(screen.getByRole('button', { name: 'Borrar mis datos' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sí, borrar' }))
    expect(await screen.findByText(/No pude borrar tus datos/)).toBeTruthy()
    expect(deletes(api)).toHaveLength(1)
    expect(userId()).toBe(before)
    expect(localStorage.getItem('rappi-proto-orders')).not.toBeNull()
    expect(screen.getByTestId('orders').textContent).toBe('1')
  })
})

describe('forgetAll', () => {
  test('vacía la cola de eventos antes de cualquier espera', () => {
    stubApi({ 'DELETE /profile/*': {} })
    const events = { clear: vi.fn(), settled: vi.fn().mockResolvedValue(undefined) }
    forgetAll({ events, settle: () => new Promise(() => {}) }) // la espera previa nunca termina
    expect(events.clear).toHaveBeenCalledTimes(1)
    expect(events.settled).not.toHaveBeenCalled()
  })

  test('si el DELETE falla, devuelve el guardado al juego y no cambia el id', async () => {
    stubApi({ 'DELETE /profile/*': 500 })
    const before = userId()
    const game = { settle: vi.fn().mockResolvedValue(undefined), forget: vi.fn(), resume: vi.fn() }
    const events = { clear: vi.fn(), settled: vi.fn().mockResolvedValue(undefined) }
    await expect(forgetAll({ events, game })).rejects.toThrow()
    expect(game.resume).toHaveBeenCalledTimes(1)
    expect(game.forget).not.toHaveBeenCalled()
    expect(userId()).toBe(before)
  })
})
