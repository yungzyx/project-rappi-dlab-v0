import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ALL_PRODUCTS } from '../data/catalog'
import { AssistantProvider } from '../state/AssistantContext'
import { CartProvider, useCart } from '../state/CartContext'
import { DemoProvider } from '../state/DemoContext'
import { NudgeProvider } from '../state/NudgeContext'
import { ProfileProvider, useProfile } from '../state/ProfileContext'
import AddButton from './AddButton'

const events = vi.hoisted(() => ({ track: vi.fn(), flush: async () => {}, clear: () => {}, settled: async () => {} }))
vi.mock('../state/EventsContext', async (importOriginal) => ({ ...(await importOriginal()), useEvents: () => events }))

function Providers({ children }) {
  return (
    <DemoProvider>
      <ProfileProvider>
        <AssistantProvider>
          <CartProvider>
            <NudgeProvider>{children}</NudgeProvider>
          </CartProvider>
        </AssistantProvider>
      </ProfileProvider>
    </DemoProvider>
  )
}

afterEach(() => {
  cleanup()
  events.track.mockClear()
  localStorage.clear()
})

describe('AddButton', () => {
  test('los eventos del carrito llevan el concepto también en productos de las capturas', () => {
    const heineken = ALL_PRODUCTS.find((product) => product.id === 'p-heineken')
    render(<AddButton product={heineken} />, { wrapper: Providers })
    fireEvent.click(screen.getByLabelText(`Agregar ${heineken.name}`))
    expect(events.track).toHaveBeenCalledWith(
      'cart_add',
      expect.objectContaining({ concept_id: 'cerveza', vertical: 'liquor' }),
    )
  })

  test('la cantidad es por oferta: el mismo producto en otra tienda no aparece agregado', () => {
    const offer = { id: 'cat-200', name: 'Cerveza Escudo', price: '$1.290', vertical: 'licores', store: 'Botillería' }
    render(
      <>
        <AddButton product={offer} />
        <AddButton product={{ ...offer, vertical: 'supermercado', store: 'Unimarc' }} />
      </>,
      { wrapper: Providers },
    )
    fireEvent.click(screen.getAllByLabelText('Agregar Cerveza Escudo')[0])
    expect(screen.getAllByLabelText(/^Quitar uno de /)).toHaveLength(1)
    expect(screen.getAllByLabelText('Agregar Cerveza Escudo')).toHaveLength(1)
  })

  test('quitar y volver a agregar una sugerencia no es otra aceptación, ni en el carro siguiente: se mostró una vez', () => {
    const suggested = {
      id: 'cat-1',
      name: 'Papas Lays',
      price: '$1.990',
      vertical: 'supermercado',
      store: 'Unimarc',
      concept: 'snacks-salados',
      fromSuggestion: true,
      suggestionOrigin: 'chat',
    }
    render(
      <>
        <AddButton product={suggested} />
        <ClearCart />
      </>,
      { wrapper: Providers },
    )
    fireEvent.click(screen.getByLabelText('Agregar Papas Lays'))
    fireEvent.click(screen.getByLabelText(/^Quitar uno de /))
    fireEvent.click(screen.getByLabelText('Agregar Papas Lays'))
    expect(count('cart_add')).toBe(2)
    expect(count('suggestion_accepted')).toBe(1)

    fireEvent.click(screen.getByText('vaciar')) // tras un pedido el carro es otro
    fireEvent.click(screen.getByLabelText('Agregar Papas Lays'))
    expect(count('suggestion_accepted')).toBe(1)
  })

  test('tras «Olvidar» (el servidor borra sus eventos), volver a aceptarla en el mismo carro sí cuenta', () => {
    const suggested = {
      id: 'cat-2',
      name: 'Maní Salado',
      price: '$1.490',
      vertical: 'supermercado',
      store: 'Unimarc',
      concept: 'snacks-salados',
      fromSuggestion: true,
      suggestionOrigin: 'para-ti',
    }
    render(
      <>
        <AddButton product={suggested} />
        <ForgetProfile />
      </>,
      { wrapper: Providers },
    )
    fireEvent.click(screen.getByLabelText('Agregar Maní Salado'))
    fireEvent.click(screen.getByLabelText(/^Quitar uno de /))
    fireEvent.click(screen.getByText('olvidar'))
    fireEvent.click(screen.getByLabelText('Agregar Maní Salado'))
    expect(count('suggestion_accepted')).toBe(2)
  })
})

const count = (type) => events.track.mock.calls.filter(([name]) => name === type).length

function ForgetProfile() {
  const profile = useProfile()
  return (
    <button type="button" onClick={profile.reset}>
      olvidar
    </button>
  )
}

function ClearCart() {
  const cart = useCart()
  return (
    <button type="button" onClick={cart.clear}>
      vaciar
    </button>
  )
}
