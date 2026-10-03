import { StrictMode } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ToastProvider } from '../../components/Toast'
import { ALL_PRODUCTS } from '../../data/catalog'
import { AssistantProvider } from '../../state/AssistantContext'
import { CartProvider } from '../../state/CartContext'
import { DemoProvider } from '../../state/DemoContext'
import { FavoritesProvider } from '../../state/FavoritesContext'
import { NudgeProvider } from '../../state/NudgeContext'
import { ProfileProvider } from '../../state/ProfileContext'
import StoreScreen from './StoreScreen'

const events = vi.hoisted(() => ({ track: vi.fn(), flush: async () => {}, clear: () => {}, settled: async () => {} }))
vi.mock('../../state/EventsContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useEvents: () => events,
}))

function Providers({ children }) {
  return (
    <StrictMode>
      <DemoProvider>
        <ProfileProvider>
          <AssistantProvider>
            <CartProvider>
              <FavoritesProvider>
                <ToastProvider>
                  <NudgeProvider>{children}</NudgeProvider>
                </ToastProvider>
              </FavoritesProvider>
            </CartProvider>
          </AssistantProvider>
        </ProfileProvider>
      </DemoProvider>
    </StrictMode>
  )
}

const openStore = (params) =>
  render(<StoreScreen back={() => {}} push={() => {}} params={params} />, { wrapper: Providers })
const tracked = (type) => events.track.mock.calls.filter(([name]) => name === type).map(([, fields]) => fields)

afterEach(() => {
  cleanup()
  events.track.mockClear()
  localStorage.clear()
})

describe('visita a una tienda (embudo del panel)', () => {
  test('view_store lleva la vertical de la tienda: la de sus productos, la de su vertical o restaurantes', () => {
    openStore({ store: { name: 'Unimarc' } })
    openStore({ store: { name: 'Copetexpress' } }) // tienda de la pantalla Liquor, sin productos
    openStore({ store: { name: 'Kfc Turbo' } })
    expect(tracked('view_store').map((fields) => [fields.payload.name, fields.vertical])).toEqual([
      ['Unimarc', 'grocery'],
      ['Copetexpress', 'liquor'],
      ['Kfc Turbo', 'restaurants'],
    ])
  })

  test('abrirla desde un producto es ver ese producto: view_item con su vertical y su concepto, una vez', () => {
    const heineken = ALL_PRODUCTS.find((product) => product.id === 'p-heineken')
    openStore({ store: { name: heineken.store }, item: heineken })
    expect(tracked('view_item')).toEqual([expect.objectContaining({ vertical: 'liquor', concept_id: 'cerveza' })])
    expect(tracked('view_store')).toHaveLength(1)
  })

  test('abrirla sin tocar un producto no es ver un producto', () => {
    openStore({ store: { name: 'Unimarc' } })
    expect(tracked('view_item')).toEqual([])
  })
})
