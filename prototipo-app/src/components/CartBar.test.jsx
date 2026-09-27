import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { ALL_PRODUCTS } from '../data/catalog'
import { AssistantProvider } from '../state/AssistantContext'
import { CartProvider, useCart } from '../state/CartContext'
import { DemoProvider } from '../state/DemoContext'
import { NudgeProvider } from '../state/NudgeContext'
import { ProfileProvider } from '../state/ProfileContext'
import CartBar from './CartBar'

const events = vi.hoisted(() => ({ track: vi.fn(), flush: async () => {}, clear: () => {}, settled: async () => {} }))
vi.mock('../state/EventsContext', async (importOriginal) => ({ ...(await importOriginal()), useEvents: () => events }))

function Seed({ products }) {
  const cart = useCart()
  useEffect(() => products.forEach((product) => cart.add(product)), []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

afterEach(() => {
  cleanup()
  events.track.mockClear()
  localStorage.clear()
})

test('vaciar el carro lo registra (una salida por línea con sus unidades): si no, el panel lo cuenta como abandono', () => {
  const [beer, other] = [ALL_PRODUCTS.find((p) => p.id === 'p-heineken'), ALL_PRODUCTS.find((p) => p.id !== 'p-heineken')]
  render(
    <DemoProvider>
      <ProfileProvider>
        <AssistantProvider>
          <CartProvider>
            <NudgeProvider>
              <Seed products={[beer, beer, other]} />
              <CartBar push={() => {}} />
            </NudgeProvider>
          </CartProvider>
        </AssistantProvider>
      </ProfileProvider>
    </DemoProvider>,
  )
  fireEvent.click(screen.getByText('View cart'))
  fireEvent.click(screen.getByText('Empty cart'))

  const removes = events.track.mock.calls.filter(([type]) => type === 'cart_remove').map(([, fields]) => fields)
  expect(removes.map((r) => r.payload.qty).sort()).toEqual([1, 2])
  expect(new Set(removes.map((r) => r.cart_id)).size).toBe(1)
  expect(screen.queryByText('View cart')).toBeNull()
})
