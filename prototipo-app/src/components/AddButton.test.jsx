import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ALL_PRODUCTS } from '../data/catalog'
import { AssistantProvider } from '../state/AssistantContext'
import { CartProvider } from '../state/CartContext'
import { DemoProvider } from '../state/DemoContext'
import { NudgeProvider } from '../state/NudgeContext'
import { ProfileProvider } from '../state/ProfileContext'
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
    expect(screen.getAllByLabelText('Quitar uno')).toHaveLength(1)
    expect(screen.getAllByLabelText('Agregar Cerveza Escudo')).toHaveLength(1)
  })
})
