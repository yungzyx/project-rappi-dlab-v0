import { useEffect } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { buildOrders } from '../../api/orders'
import { ToastProvider } from '../../components/Toast'
import { AddressProvider } from '../../state/AddressContext'
import { AssistantProvider } from '../../state/AssistantContext'
import { CartProvider, useCart } from '../../state/CartContext'
import { DemoProvider } from '../../state/DemoContext'
import { FavoritesProvider } from '../../state/FavoritesContext'
import { NudgeProvider } from '../../state/NudgeContext'
import { ProfileProvider } from '../../state/ProfileContext'
import StoreScreen from '../store/StoreScreen'
import VerticalScreen from './VerticalScreen'

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
                  <NudgeProvider>{children}</NudgeProvider>
                </ToastProvider>
              </AddressProvider>
            </FavoritesProvider>
          </CartProvider>
        </AssistantProvider>
      </ProfileProvider>
    </DemoProvider>
  )
}

function renderVertical(id) {
  const push = vi.fn()
  render(
    <>
      <VerticalScreen back={() => {}} push={push} params={{ id }} />
      <CartProbe />
    </>,
    { wrapper: Providers },
  )
  return push
}

const probe = { cart: [] }
function CartProbe() {
  const { items } = useCart()
  useEffect(() => {
    probe.cart = items
  })
  return null
}

const shown = () => events.track.mock.calls.filter(([type]) => type === 'suggestion_shown').map(([, fields]) => fields)

beforeAll(() => {
  Element.prototype.scrollTo = () => {} // jsdom no lo implementa (carrusel de banners)
})
afterAll(() => {
  delete Element.prototype.scrollTo
})
afterEach(() => {
  cleanup()
  events.track.mockClear()
  localStorage.clear()
})

describe('entradas al embudo desde una vertical', () => {
  test('el buscador se abre con la vertical de la pantalla (en «Rappi hoy», el plano)', () => {
    localStorage.setItem('rappi-proto-demo-mode', 'actual')
    const push = renderVertical('liquor')
    fireEvent.click(screen.getByText('Search stores or products'))
    expect(push).toHaveBeenCalledWith('search', { vertical: 'liquor' })
  })

  test('en la Propuesta, el buscador de la vertical es el de Bigotes', () => {
    const push = renderVertical('liquor')
    fireEvent.click(screen.getByText('Search stores or products'))
    expect(push).not.toHaveBeenCalled()
    expect(window.history.state).toMatchObject({ assistant: true })
  })

  test('las tiendas de una categoría o de «View more» llevan la vertical de la pantalla, como texto', () => {
    const push = renderVertical('liquor')
    fireEvent.click(screen.getByText('Beers and ciders'))
    for (const button of screen.getAllByText('View more')) fireEvent.click(button)
    const listed = push.mock.calls.filter(([name]) => name === 'list').flatMap(([, params]) => params.stores)
    expect(listed.length).toBeGreaterThan(0)
    expect(listed.map((store) => store.vertical)).toEqual(listed.map(() => 'liquor'))
    cleanup()

    // La primera de la lista abierta (lista → tienda): su visita va a Liquor y no se rechaza el lote en rappi-ia.
    const [first] = listed
    render(<StoreScreen back={() => {}} push={() => {}} params={{ store: first }} />, { wrapper: Providers })
    const visits = events.track.mock.calls.filter(([type]) => type === 'view_store').map(([, fields]) => fields)
    expect(visits).toEqual([expect.objectContaining({ vertical: 'liquor', payload: { name: first.name } })])
  })

  test('tocar un producto abre su tienda con ese producto (así se registra que lo vio)', () => {
    const push = renderVertical('grocery')
    fireEvent.click(screen.getByText('Heineken Cerveza Lager Lata 12 pack'))
    expect(push).toHaveBeenCalledWith(
      'store',
      expect.objectContaining({
        store: expect.objectContaining({ name: 'Unimarc' }),
        item: expect.objectContaining({ id: 'gro-heineken' }),
      }),
    )
  })
})

describe('«Para ti, de otras tiendas» (cerebro local)', () => {
  test('lo que se agrega desde la fila llega al pedido como sugerencia y su aceptación lleva el concepto', () => {
    renderVertical('liquor')
    const row = screen.getByText('Para ti, de otras tiendas').closest('section')
    fireEvent.click(within(row).getByLabelText('Agregar Kryzpo Botana Wavy con Sal de Mar'))

    const [order] = buildOrders(probe.cart, { userId: 'proto-1', sessionId: 's-1', cartId: 'c-1' })
    expect(order.lines[0]).toMatchObject({ concept_id: 'snacks-salados', from_suggestion: true })
    expect(events.track).toHaveBeenCalledWith('suggestion_accepted', {
      concept_id: 'snacks-salados',
      vertical: 'express',
      payload: { origen: 'vertical-para-ti' },
    })
  })

  test('la fila cuenta como mostrada una vez por concepto y vertical, no en cada visita', () => {
    // Farmacia (lo mostrado se recuerda lo que dura la pestaña: otra vertical que la del test anterior).
    renderVertical('pharmacy')
    cleanup()
    renderVertical('pharmacy')
    const fruits = shown().filter((fields) => fields.concept_id === 'frutas')
    expect(fruits).toEqual([{ concept_id: 'frutas', vertical: 'grocery', payload: { origen: 'vertical-para-ti' } }])
  })
})
