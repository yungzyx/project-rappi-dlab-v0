import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { ToastProvider } from '../../components/Toast'
import { AssistantProvider } from '../../state/AssistantContext'
import { CartProvider, useCart } from '../../state/CartContext'
import { DemoProvider } from '../../state/DemoContext'
import { FavoritesProvider } from '../../state/FavoritesContext'
import { NudgeProvider } from '../../state/NudgeContext'
import { ProfileProvider } from '../../state/ProfileContext'
import { TURBO_OFFERS, TURBO_PRODUCTS, productsForTab } from './data'
import TurboScreen from './TurboScreen'

const events = vi.hoisted(() => ({ track: vi.fn(), flush: async () => {}, clear: () => {}, settled: async () => {} }))
vi.mock('../../state/EventsContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useEvents: () => events,
}))

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {} // jsdom no lo implementa
})
afterEach(cleanup)

function AddToCart({ product }) {
  const cart = useCart()
  return (
    <button type="button" onClick={() => cart.add(product)}>
      sumar
    </button>
  )
}

const renderTurbo = (extra = null) =>
  render(
    <DemoProvider>
      <ProfileProvider>
        <AssistantProvider>
          <CartProvider>
            <FavoritesProvider>
              <ToastProvider>
                <NudgeProvider>
                  <TurboScreen back={vi.fn()} push={vi.fn()} />
                  {extra}
                </NudgeProvider>
              </ToastProvider>
            </FavoritesProvider>
          </CartProvider>
        </AssistantProvider>
      </ProfileProvider>
    </DemoProvider>,
  )

describe('datos de Turbo', () => {
  test('solo hay productos de súper, express, botillería y farmacia', () => {
    expect(TURBO_PRODUCTS.length).toBeGreaterThan(6)
    expect(TURBO_PRODUCTS.every((product) => product.vertical !== 'restaurants')).toBe(true)
    expect(TURBO_OFFERS.every((product) => product.discount)).toBe(true)
  })

  test('cada pestaña trae al menos 6 productos y los que calzan van primero', () => {
    for (const tab of ['frescos', 'despensa', 'picoteo', 'home'])
      expect(productsForTab(tab).length).toBeGreaterThanOrEqual(6)
    expect(productsForTab('frescos')[0].name).toMatch(/palta|zapallo|pollo|naranja|mandarina|haba/i)
    expect(productsForTab('todo')).toBe(TURBO_PRODUCTS)
  })
})

describe('TurboScreen', () => {
  test('las pestañas cambian la grilla y la promo saludable lleva a Frescos', () => {
    renderTurbo()
    const names = () => [...document.querySelectorAll('.turbo-grid .product-name')].map((el) => el.textContent)
    expect(names()).toEqual(TURBO_PRODUCTS.map((product) => product.name))

    fireEvent.click(screen.getByRole('tab', { name: 'Picoteo' }))
    expect(names()).toEqual(productsForTab('picoteo').map((product) => product.name))

    fireEvent.click(screen.getByRole('button', { name: 'Saludable: frescos' }))
    expect(screen.getByRole('tab', { name: 'Frescos' }).getAttribute('aria-selected')).toBe('true')
  })

  test('la tarifa de servicio descuenta lo que hay en el carrito', () => {
    const product = { id: 'x', name: 'Caja', price: '$20.000', vertical: 'grocery', store: 'Unimarc' }
    renderTurbo(<AddToCart product={product} />)
    expect(screen.getByText('$29.900')).toBeTruthy()
    fireEvent.click(screen.getByText('sumar'))
    expect(screen.getByText('$9.900')).toBeTruthy()
    fireEvent.click(screen.getByText('sumar'))
    expect(screen.getByText('Discount unlocked.')).toBeTruthy()
  })

  test('Offers y Categories muestran datos locales; una categoría vuelve a la grilla', () => {
    renderTurbo()
    fireEvent.click(screen.getByRole('button', { name: 'Offers' }))
    expect(document.querySelectorAll('.turbo-grid .product-card')).toHaveLength(TURBO_OFFERS.length)
    expect(screen.queryByText('Esta sección no está en el prototipo')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Categories' }))
    fireEvent.click(screen.getByRole('button', { name: /^Despensa/ }))
    expect(screen.getByRole('tab', { name: 'Despensa' }).getAttribute('aria-selected')).toBe('true')
  })
})
