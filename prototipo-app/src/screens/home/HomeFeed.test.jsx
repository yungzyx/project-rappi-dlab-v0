import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { ToastProvider } from '../../components/Toast'
import { AddressProvider } from '../../state/AddressContext'
import { AssistantProvider } from '../../state/AssistantContext'
import { CartProvider } from '../../state/CartContext'
import { DemoProvider } from '../../state/DemoContext'
import { shownTopics } from '../../state/EventsContext'
import { NudgeProvider } from '../../state/NudgeContext'
import { ProfileProvider } from '../../state/ProfileContext'
import HomeFeed from './HomeFeed'

const api = vi.hoisted(() => ({ health: vi.fn(), recommendations: vi.fn() }))
vi.mock('../../api/client', async (importOriginal) => ({ ...(await importOriginal()), ...api }))
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

beforeAll(() => {
  Element.prototype.scrollTo = () => {} // jsdom no lo implementa (carruseles)
})
afterAll(() => {
  delete Element.prototype.scrollTo
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

describe('«Para ti» de rappi-ia en la Home', () => {
  test('su sugerencia cuenta como tema ya sugerido en la sesión: el chat no la repite', async () => {
    api.health.mockResolvedValue({ voz: false })
    api.recommendations.mockResolvedValue({
      rows: [
        {
          reason: 'Porque te interesa 🍺 cerveza',
          concept: 'snacks-salados',
          vertical: 'supermercado',
          products: [{ id: 'cat-1', name: 'Papas Lays', price: '$1.990', store: 'Unimarc', vertical: 'supermercado' }],
        },
      ],
    })
    render(<HomeFeed push={() => {}} />, { wrapper: Providers })

    await waitFor(() => expect(screen.getByText('Papas Lays')).toBeTruthy())
    await waitFor(() => expect(shownTopics()).toEqual(['snacks-salados']))
  })
})
