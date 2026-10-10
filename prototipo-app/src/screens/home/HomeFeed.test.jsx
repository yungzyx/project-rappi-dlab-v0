import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ToastProvider } from '../../components/Toast'
import { AddressProvider } from '../../state/AddressContext'
import { AssistantProvider } from '../../state/AssistantContext'
import { CartProvider } from '../../state/CartContext'
import { DemoProvider } from '../../state/DemoContext'
import { ProfileProvider } from '../../state/ProfileContext'
import HomeFeed from './HomeFeed'

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
              <ToastProvider>{children}</ToastProvider>
            </AddressProvider>
          </CartProvider>
        </AssistantProvider>
      </ProfileProvider>
    </DemoProvider>
  )
}

beforeAll(() => {
  Element.prototype.scrollTo = () => {} // jsdom no lo implementa (carruseles)
})
afterAll(() => {
  delete Element.prototype.scrollTo
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('Home de «Rappi hoy»', () => {
  const renderHome = () => {
    localStorage.setItem('rappi-proto-demo-mode', 'actual')
    return render(<HomeFeed push={vi.fn()} />, { wrapper: Providers })
  }

  test('es la app como es hoy: buscador plano, sin Mochi ni fila «Para ti»', () => {
    renderHome()
    expect(screen.queryByRole('button', { name: 'Abrir buscador con Mochi' })).toBeNull()
    expect(document.querySelector('.for-you')).toBeNull()
    expect(document.querySelector('.search-bar')).not.toBeNull()
  })

  test('RappiFavor sigue no disponible, como en la app', () => {
    renderHome()
    expect(screen.getByLabelText('RappiFavor (no disponible)')).toBeTruthy()
  })
})
