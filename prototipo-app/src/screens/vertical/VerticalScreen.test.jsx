import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { ToastProvider } from '../../components/Toast'
import { AddressProvider } from '../../state/AddressContext'
import { AssistantProvider } from '../../state/AssistantContext'
import { CartProvider } from '../../state/CartContext'
import { DemoProvider } from '../../state/DemoContext'
import { NudgeProvider } from '../../state/NudgeContext'
import { ProfileProvider } from '../../state/ProfileContext'
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
            <AddressProvider>
              <ToastProvider>
                <NudgeProvider>{children}</NudgeProvider>
              </ToastProvider>
            </AddressProvider>
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
  test('el buscador se abre con la vertical de la pantalla', () => {
    const push = renderVertical('liquor')
    fireEvent.click(screen.getByText('Search stores or products'))
    expect(push).toHaveBeenCalledWith('search', { vertical: 'liquor' })
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
