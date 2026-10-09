import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { AssistantProvider } from '../state/AssistantContext'
import { CartProvider, useCart } from '../state/CartContext'
import { DemoProvider } from '../state/DemoContext'
import { NudgeProvider } from '../state/NudgeContext'
import { ProductSheetProvider } from '../state/ProductSheetContext'
import { ProfileProvider } from '../state/ProfileContext'
import { ProductCard } from './ProductCard'
import ProductRow from './ProductRow'
import ProductSheet from './ProductSheet'

const events = vi.hoisted(() => ({ track: vi.fn(), flush: async () => {}, clear: () => {}, settled: async () => {} }))
vi.mock('../state/EventsContext', async (importOriginal) => ({ ...(await importOriginal()), useEvents: () => events }))

const beer = {
  id: 'p-1',
  name: 'Royal Guard Cerveza Lager 6 latas',
  img: '',
  price: '$6.290',
  before: '$8.490',
  discount: '-26%',
  store: 'Liquidos',
  storeBadge: '#333',
  vertical: 'liquor',
}

function CartProbe() {
  const cart = useCart()
  return (
    <output data-testid="cart">
      {cart.count}|{cart.noteOf(beer)}
    </output>
  )
}

function renderWith(children) {
  return render(
    <DemoProvider>
      <ProfileProvider>
        <AssistantProvider>
          <CartProvider>
            <NudgeProvider>
              <ProductSheetProvider>
                {children}
                <ProductSheet />
                <CartProbe />
              </ProductSheetProvider>
            </NudgeProvider>
          </CartProvider>
        </AssistantProvider>
      </ProfileProvider>
    </DemoProvider>,
  )
}

afterEach(() => {
  cleanup()
  events.track.mockClear()
  localStorage.clear() // el carro persiste: cada prueba parte vacío
})

describe('ProductSheet', () => {
  test('tocar una tarjeta abre la hoja con precio, descuento y «Ver tienda»', () => {
    const onOpenStore = vi.fn()
    renderWith(<ProductCard product={beer} onOpenStore={onOpenStore} />)
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByText(beer.name))
    const dialog = screen.getByRole('dialog', { name: beer.name })
    expect(dialog.textContent).toContain('$8.490')
    expect(dialog.textContent).toContain('-26%')
    expect(screen.getByRole('button', { name: 'Agregar 1 · $6.290' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Ver tienda/ }))
    expect(onOpenStore).toHaveBeenCalledTimes(1)
  })

  test('el contador y la nota van al carrito; al reabrir dice «Actualizar»', () => {
    renderWith(<ProductRow product={beer} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${beer.name}`) }))
    let dialog = within(screen.getByRole('dialog'))

    fireEvent.click(dialog.getByRole('button', { name: /^Agregar uno de / }))
    fireEvent.click(dialog.getByRole('button', { name: /^Agregar uno de / }))
    fireEvent.change(dialog.getByLabelText('Notas para la tienda'), { target: { value: 'Bien frías' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Agregar 3 · $18.870' }))

    expect(screen.getByTestId('cart').textContent).toBe('3|Bien frías')
    expect(events.track.mock.calls.filter(([type]) => type === 'cart_add')).toHaveLength(3)
    expect(screen.getByRole('dialog').closest('.sheet-layer').classList.contains('is-open')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${beer.name}`) }))
    dialog = within(screen.getByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: /^Quitar uno de / }))
    fireEvent.click(dialog.getByRole('button', { name: 'Actualizar 2 · $12.580' }))
    expect(screen.getByTestId('cart').textContent).toBe('2|Bien frías')
    expect(events.track.mock.calls.filter(([type]) => type === 'cart_remove')).toHaveLength(1)
  })

  test('el "+" de la fila no abre la hoja', () => {
    renderWith(<ProductRow product={beer} />)
    fireEvent.click(screen.getByLabelText(`Agregar ${beer.name}`))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('cart').textContent).toBe('1|')
  })
})
