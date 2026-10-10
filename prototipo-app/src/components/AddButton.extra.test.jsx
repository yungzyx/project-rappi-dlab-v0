import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ALL_PRODUCTS } from '../data/catalog'
import { AssistantProvider, useAssistant } from '../state/AssistantContext'
import { CartProvider } from '../state/CartContext'
import { DemoProvider } from '../state/DemoContext'
import { NudgeProvider, useNudge } from '../state/NudgeContext'
import { ProfileProvider, useProfile } from '../state/ProfileContext'
import { MOCHI_CART_EVENT, session } from '../state/liveMemory'
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

function Probe() {
  const profile = useProfile()
  const { nudge } = useNudge()
  const assistant = useAssistant()
  return (
    <>
      <output aria-label="perfil">{profile.top.join(',')}</output>
      <output aria-label="aviso">{nudge ? nudge.tag : 'ninguno'}</output>
      <button type="button" onClick={() => assistant.open()}>
        abrir chat
      </button>
    </>
  )
}

const heineken = ALL_PRODUCTS.find((product) => product.id === 'p-heineken')
const add = () => fireEvent.click(screen.getByLabelText(`Agregar ${heineken.name}`))

afterEach(() => {
  cleanup()
  events.track.mockClear()
  session.lastAdded = null
  localStorage.clear()
})

describe('AddButton (extra)', () => {
  test('agregar suma interés al perfil y quitar manda cart_remove', () => {
    render(<><AddButton product={heineken} /><Probe /></>, { wrapper: Providers })
    add()
    expect(screen.getByLabelText('perfil').textContent).toContain('cerveza')
    fireEvent.click(screen.getByLabelText(/^Quitar uno de /))
    expect(events.track).toHaveBeenCalledWith('cart_remove', expect.objectContaining({ concept_id: 'cerveza' }))
  })

  test('en el prototipo final no hay aviso al agregar: Mochi lo comenta al volver a la Home', () => {
    render(<><AddButton product={heineken} /><Probe /></>, { wrapper: Providers })
    add()
    expect(screen.getByLabelText('aviso').textContent).toBe('ninguno')
    expect(session.lastAdded).toMatchObject({ id: heineken.id })
  })

  test('con el buscador con Mochi abierto tampoco hay aviso', () => {
    render(<><AddButton product={heineken} /><Probe /></>, { wrapper: Providers })
    fireEvent.click(screen.getByText('abrir chat'))
    add()
    expect(screen.getByLabelText('aviso').textContent).toBe('ninguno')
  })

  test('si se quita lo último agregado (p. ej. «Deshacer»), Mochi no lo comenta al volver a la Home', () => {
    render(<><AddButton product={heineken} /><Probe /></>, { wrapper: Providers })
    add()
    expect(session.lastAdded).toMatchObject({ id: heineken.id })
    fireEvent.click(screen.getByLabelText(/^Quitar uno de /))
    expect(session.lastAdded).toBeNull()
  })

  test('en el prototipo final, agregar avisa a Mochi', () => {
    const heard = vi.fn()
    window.addEventListener(MOCHI_CART_EVENT, heard)
    render(<><AddButton product={heineken} /><Probe /></>, { wrapper: Providers })
    add()
    window.removeEventListener(MOCHI_CART_EVENT, heard)
    expect(heard).toHaveBeenCalledTimes(1)
    expect(heard.mock.calls[0][0].detail.product).toMatchObject({ id: heineken.id })
  })

  test('en «Rappi hoy» agregar no avisa a Mochi', () => {
    localStorage.setItem('rappi-proto-demo-mode', 'actual')
    const heard = vi.fn()
    window.addEventListener(MOCHI_CART_EVENT, heard)
    render(<><AddButton product={heineken} /><Probe /></>, { wrapper: Providers })
    add()
    window.removeEventListener(MOCHI_CART_EVENT, heard)
    expect(heard).not.toHaveBeenCalled()
  })

  test('en «Rappi hoy» no hay aviso ni memoria de Mochi', () => {
    localStorage.setItem('rappi-proto-demo-mode', 'actual')
    render(<><AddButton product={heineken} /><Probe /></>, { wrapper: Providers })
    add()
    expect(screen.getByLabelText('aviso').textContent).toBe('ninguno')
    expect(session.lastAdded).toBeNull()
  })
})
