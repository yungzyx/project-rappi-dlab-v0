import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { ToastProvider } from '../../components/Toast'
import AssistantPanel from '../../components/assistant/AssistantPanel'
import ForYouRow from '../../components/assistant/ForYouRow'
import { REAL_DISHES } from '../../data/realMenus'
import { AddressProvider } from '../../state/AddressContext'
import { AssistantProvider, useAssistant } from '../../state/AssistantContext'
import { CartProvider } from '../../state/CartContext'
import { DemoProvider } from '../../state/DemoContext'
import { FavoritesProvider } from '../../state/FavoritesContext'
import { NudgeProvider } from '../../state/NudgeContext'
import { ProductSheetProvider } from '../../state/ProductSheetContext'
import ProductSheet from '../../components/ProductSheet'
import { ProfileProvider } from '../../state/ProfileContext'
import RestaurantsScreen from '../restaurants/RestaurantsScreen'
import StoreScreen from './StoreScreen'

// menus.json exportado (fuera de git) con dos sucursales que quedan con el mismo nombre recortado.
const RAW = vi.hoisted(() => {
  const branch = (id, name, dish) => ({
    id,
    name,
    rating: 4.5,
    eta: '30 min',
    deliveryCost: 0,
    sections: [
      {
        name: 'Tortas',
        items: [
          { id: id * 10, name: dish, price: 9990, realPrice: 9990, discount: 0 },
          // Sin palabras de un tema: el cerebro local lo encuentra buscando por nombre.
          { id: id * 10 + 1, name: dish.replace('Torta', 'Lomo'), price: 8990, realPrice: 8990, discount: 0 },
        ],
      },
    ],
  })
  return [
    branch(1, 'Délice - Divina Providencia', 'Torta de Providencia'),
    branch(2, 'Délice - Las Condes', 'Torta de Las Condes'),
  ]
})
vi.mock('../../data/realMenus', async (importOriginal) => {
  const actual = await importOriginal()
  const REAL_RESTAURANTS = RAW.map(actual.toRestaurant)
  const REAL_DISHES = REAL_RESTAURANTS.flatMap((restaurant) => restaurant.sections.flatMap((section) => section.items))
  return { ...actual, REAL_RESTAURANTS, REAL_DISHES }
})
// Sin la API: en el chat contesta el cerebro local.
vi.mock('../../api/client', async (importOriginal) => ({ ...(await importOriginal()), health: async () => null }))
const events = vi.hoisted(() => ({ track: vi.fn(), flush: async () => {}, clear: () => {}, settled: async () => {} }))
vi.mock('../../state/EventsContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useEvents: () => events,
}))

function Providers({ children }) {
  return (
    <DemoProvider>
      <ProfileProvider>
        <AssistantProvider>
          <CartProvider>
            <FavoritesProvider>
              <AddressProvider>
                <ToastProvider>
                  <NudgeProvider>
                    <ProductSheetProvider>
                      {children}
                      <ProductSheet />
                    </ProductSheetProvider>
                  </NudgeProvider>
                </ToastProvider>
              </AddressProvider>
            </FavoritesProvider>
          </CartProvider>
        </AssistantProvider>
      </ProfileProvider>
    </DemoProvider>
  )
}

/** Abre la página de tienda con esos parámetros y espera el menú (tiene una pausa con esqueleto). */
async function openStore(params) {
  render(<StoreScreen back={() => {}} push={() => {}} params={params} />, { wrapper: Providers })
  await act(() => vi.advanceTimersByTimeAsync(1000))
}

/** La tienda que se abrió con el último push, como queda en el historial. */
async function openPushed(push) {
  const [name, params] = push.mock.calls.at(-1)
  expect(name).toBe('store')
  cleanup()
  await openStore(JSON.parse(JSON.stringify(params)))
}

const visits = () => events.track.mock.calls.filter(([type]) => type === 'view_store').map(([, fields]) => fields)

/** Avanza de a poco hasta que el chat termina («escribiendo…» y el texto letra por letra). */
async function runUntilIdle() {
  await act(() => vi.advanceTimersByTimeAsync(0))
  for (let i = 0; i < 100 && vi.getTimerCount() > 0; i++) await act(() => vi.advanceTimersByTimeAsync(250))
}

function OpenAssistant() {
  const assistant = useAssistant()
  return (
    <button type="button" onClick={() => assistant.open({ query: 'lomo de las condes' })}>
      preguntar
    </button>
  )
}

beforeAll(() => {
  Element.prototype.scrollTo = () => {} // jsdom no lo implementa (carrusel de banners)
  Element.prototype.scrollIntoView = () => {} // ni este (pestañas del menú)
})
afterAll(() => {
  delete Element.prototype.scrollTo
  delete Element.prototype.scrollIntoView
})
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  events.track.mockClear()
  localStorage.clear()
})

describe('sucursales con el mismo nombre (menús reales)', () => {
  test('en «Cerca de ti», abrir la segunda muestra sus propios platos', async () => {
    const push = vi.fn()
    render(<RestaurantsScreen back={() => {}} push={push} />, { wrapper: Providers })
    fireEvent.click(screen.getByText('Las Condes').closest('button'))
    const [name, params] = push.mock.calls.at(-1)
    expect(name).toBe('store')
    cleanup()

    await openStore(JSON.parse(JSON.stringify(params))) // como queda en el historial
    expect(screen.getByText('Torta de Las Condes')).toBeTruthy()
    expect(screen.queryByText('Torta de Providencia')).toBeNull()
  })

  test('un plato que trae Bigotes (tienda con su nombre completo) abre el menú de esa sucursal', async () => {
    await openStore({ store: { name: 'Délice - Las Condes' } })
    expect(screen.getByText('Torta de Las Condes')).toBeTruthy()
    expect(screen.queryByText('El menú completo de esta tienda todavía no está en el prototipo.')).toBeNull()
  })

  test('un plato de la segunda sucursal tocado en «Para ti» abre esa sucursal', async () => {
    const push = vi.fn()
    const dish = REAL_DISHES.find((item) => item.name === 'Torta de Las Condes')
    render(<ForYouRow title="Para ti" reason={null} products={[dish]} push={push} />, { wrapper: Providers })
    fireEvent.click(screen.getByText('Torta de Las Condes'))
    fireEvent.click(screen.getByRole('button', { name: /Ver tienda/ })) // la tarjeta abre la hoja del producto
    await openPushed(push)

    expect(screen.queryByText('Torta de Providencia')).toBeNull()
    expect(visits()).toEqual([expect.objectContaining({ entity_id: 'real-2' })])
  })

  test('un plato de la segunda sucursal tocado en el chat (cerebro local) abre esa sucursal', async () => {
    const push = vi.fn()
    render(
      <>
        <OpenAssistant />
        <AssistantPanel push={push} />
      </>,
      { wrapper: Providers },
    )
    fireEvent.click(screen.getByText('preguntar')) // sin chat escrito: se abre con la consulta
    await runUntilIdle()
    fireEvent.click(screen.getByText('Lomo de Las Condes'))
    fireEvent.click(screen.getByRole('button', { name: /Ver tienda/ }))
    await openPushed(push)

    expect(screen.queryByText('Lomo de Providencia')).toBeNull()
    expect(visits()).toEqual([expect.objectContaining({ entity_id: 'real-2' })])
  })

  test('la visita va a restaurantes, con el id de esa sucursal', async () => {
    await openStore({ store: { id: 'real-2', name: 'Délice' } })
    const [visit] = events.track.mock.calls.filter(([type]) => type === 'view_store').map(([, fields]) => fields)
    expect(visit).toMatchObject({ vertical: 'restaurants', entity_id: 'real-2' })
  })
})
