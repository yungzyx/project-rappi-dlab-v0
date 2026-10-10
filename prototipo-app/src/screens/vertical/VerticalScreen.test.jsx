import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { ToastProvider } from '../../components/Toast'
import { AddressProvider } from '../../state/AddressContext'
import { AssistantProvider } from '../../state/AssistantContext'
import { CartProvider } from '../../state/CartContext'
import { DemoProvider } from '../../state/DemoContext'
import { FavoritesProvider } from '../../state/FavoritesContext'
import { NudgeProvider } from '../../state/NudgeContext'
import { ProductSheetProvider } from '../../state/ProductSheetContext'
import ProductSheet from '../../components/ProductSheet'
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

function renderVertical(id) {
  const push = vi.fn()
  render(<VerticalScreen back={() => {}} push={push} params={{ id }} />, { wrapper: Providers })
  return push
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

  test('en la Propuesta, el buscador de la vertical es el de Mochi', () => {
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
    fireEvent.click(screen.getByRole('button', { name: /Ver tienda/ })) // la tarjeta abre la hoja del producto
    expect(push).toHaveBeenCalledWith(
      'store',
      expect.objectContaining({
        store: expect.objectContaining({ name: 'Unimarc' }),
        item: expect.objectContaining({ id: 'gro-heineken' }),
      }),
    )
  })
})

describe('sin «Para ti, de otras tiendas»', () => {
  test('en el prototipo final, entrar a una vertical no muestra sugerencias de otras tiendas', () => {
    renderVertical('liquor')
    expect(screen.queryByText('Para ti, de otras tiendas')).toBeNull()
    expect(document.querySelector('.for-you')).toBeNull()
    expect(shown()).toEqual([])
  })
})

describe('vertical desconocida', () => {
  test('un id que no existe muestra un estado vacío en vez de romper', () => {
    render(
      <Providers>
        <VerticalScreen back={() => {}} push={() => {}} params={{ id: 'no-existe' }} />
      </Providers>,
    )
    expect(screen.getByText('Esta categoría no está en el prototipo.')).toBeTruthy()
  })
})
