import { useEffect } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { today } from '../../game/progress.js'
import { AssistantProvider, useAssistant } from '../../state/AssistantContext'
import { CartProvider, formatPrice, useCart } from '../../state/CartContext'
import { DemoProvider } from '../../state/DemoContext'
import { MOCHI_DRAG_TYPE } from '../../assistant/mochiAsk'
import { MOCHI_CART_EVENT } from '../../state/liveMemory'
import { QUIET_KEY, resetQuiet } from '../../state/mochiQuiet'
import { ProfileProvider } from '../../state/ProfileContext'
import MochiPresence, { SIDE_KEY } from './MochiPresence'

const events = vi.hoisted(() => ({ track: vi.fn(), flush: async () => {}, clear: () => {}, settled: async () => {} }))
vi.mock('../../state/EventsContext', async (importOriginal) => ({ ...(await importOriginal()), useEvents: () => events }))

const BEER = { id: 'b1', name: 'Cerveza Escudo 470 cc', price: '$1.380', vertical: 'liquor', store: 'Botillería' }

// Lo que el componente de prueba ve de los contextos, para actuar sobre ellos desde el test.
const probe = {}
function Probe() {
  const assistant = useAssistant()
  const cart = useCart()
  useEffect(() => {
    probe.assistant = assistant
    probe.cart = cart
  })
  return null
}

const tree = (props = {}) => (
  <DemoProvider>
    <ProfileProvider>
    <AssistantProvider>
      <CartProvider>
        <div className="phone">
          <Probe />
          <MochiPresence screen="vertical" homeTab="home" push={vi.fn()} raised={false} {...props} />
        </div>
      </CartProvider>
    </AssistantProvider>
    </ProfileProvider>
  </DemoProvider>
)
const mochiButton = () => screen.queryByRole('button', { name: 'Mochi: ayuda y opciones' })

beforeEach(() => localStorage.setItem('rappi-proto-demo-mode', 'final'))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  resetQuiet()
  localStorage.clear()
})

const added = (product) => act(() => window.dispatchEvent(new CustomEvent(MOCHI_CART_EVENT, { detail: { product } })))
const bubble = () => document.querySelector('.mochi-bubble')

describe('Mochi y el carro', () => {
  test('al agregar dice «¡Listo! … está en tu carrito» y se va a los 4 s', () => {
    vi.useFakeTimers()
    render(tree())
    added(BEER)
    expect(bubble().textContent).toContain(`¡Listo! ${BEER.name} está en tu carrito.`)
    act(() => vi.advanceTimersByTime(4000))
    expect(bubble()).toBeNull()
  })

  test('«Deshacer» quita el producto', () => {
    render(tree())
    act(() => probe.cart.add(BEER))
    added(BEER)
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(probe.cart.count).toBe(0)
    expect(bubble()).toBeNull()
  })

  test('silenciado no dice nada', () => {
    localStorage.setItem(QUIET_KEY, today())
    render(tree())
    added(BEER)
    expect(bubble()).toBeNull()
  })

  test('cerrar el globo cuenta como ignorarlo: a la segunda, se calla', () => {
    render(tree())
    for (let i = 0; i < 2; i++) {
      added(BEER)
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    }
    added(BEER)
    expect(bubble()).toBeNull()
  })
})

describe('Mochi flotante', () => {
  test('aparece en una vertical y no en la Home, el checkout, el seguimiento ni el juego', () => {
    render(tree())
    expect(mochiButton()).toBeTruthy()
    for (const screenName of ['home', 'checkout', 'tracking', 'game']) {
      cleanup()
      render(tree({ screen: screenName, homeTab: 'home' }))
      expect(mochiButton(), screenName).toBeNull()
    }
  })

  test('en las otras pestañas de la Home sí aparece', () => {
    render(tree({ screen: 'home', homeTab: 'offers' }))
    expect(mochiButton()).toBeTruthy()
  })

  test('en «Rappi hoy» no aparece', () => {
    localStorage.setItem('rappi-proto-demo-mode', 'actual')
    render(tree())
    expect(mochiButton()).toBeNull()
  })

  test('con el buscador con Mochi abierto no aparece', () => {
    render(tree())
    act(() => probe.assistant.open())
    expect(mochiButton()).toBeNull()
  })

  test('tocarlo salta y abre el menú con sus 4 opciones; Escape lo cierra', () => {
    const { container } = render(tree())
    fireEvent.pointerDown(mochiButton())
    fireEvent.click(mochiButton())
    expect(container.querySelector('.mochi-presence .mochi').classList).toContain('mascot--jump')
    expect(mochiButton().getAttribute('aria-expanded')).toBe('true')
    for (const name of ['Buscar con Mochi', '¿Qué puedo probar?', 'Mover a la izquierda', 'Silenciar por hoy'])
      expect(screen.getByRole('button', { name })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('group', { name: 'Opciones de Mochi' })).toBeNull()
    expect(document.activeElement).toBe(mochiButton())
  })

  test('con carro, la segunda opción es revisarlo con el total', () => {
    render(tree())
    act(() => probe.cart.add(BEER))
    fireEvent.click(mochiButton())
    expect(screen.getByRole('button', { name: `Revisar mi carrito · ${formatPrice(probe.cart.total)}` })).toBeTruthy()
  })

  test('«Mover a la izquierda» lo cambia de lado y lo recuerda', () => {
    const { container } = render(tree())
    fireEvent.click(mochiButton())
    fireEvent.click(screen.getByRole('button', { name: 'Mover a la izquierda' }))
    expect(container.querySelector('.mochi-presence').classList).toContain('is-left')
    expect(localStorage.getItem(SIDE_KEY)).toBe('left')
    cleanup()
    const again = render(tree())
    expect(again.container.querySelector('.mochi-presence').classList).toContain('is-left')
  })

  test('arrastrarlo más allá de la mitad del teléfono lo deja en ese lado, sin abrir el menú', () => {
    const { container } = render(tree())
    container.querySelector('.phone').getBoundingClientRect = () => ({ left: 0, width: 400, top: 0, height: 800 })
    const body = mochiButton()
    fireEvent.pointerDown(body, { clientX: 360, pointerId: 1 })
    fireEvent.pointerMove(body, { clientX: 200, pointerId: 1 })
    fireEvent.pointerUp(body, { clientX: 40, pointerId: 1 })
    fireEvent.click(body)
    expect(container.querySelector('.mochi-presence').classList).toContain('is-left')
    expect(screen.queryByRole('group', { name: 'Opciones de Mochi' })).toBeNull()
  })

  test('«Silenciar por hoy» lo deja como pestañita y tocarla lo despierta', () => {
    const { container } = render(tree())
    fireEvent.click(mochiButton())
    fireEvent.click(screen.getByRole('button', { name: 'Silenciar por hoy' }))
    expect(container.querySelector('.mochi-presence').classList).toContain('is-quiet')
    const tab = screen.getByRole('button', { name: 'Mochi está en silencio: tocar para despertarlo' })
    fireEvent.click(tab)
    expect(container.querySelector('.mochi-presence').classList).not.toContain('is-quiet')
    expect(mochiButton()).toBeTruthy()
  })

  test('soltar una tarjeta sobre Mochi pregunta por ese producto', () => {
    render(tree())
    const data = { [MOCHI_DRAG_TYPE]: JSON.stringify(BEER) }
    const dataTransfer = { types: [MOCHI_DRAG_TYPE], getData: (type) => data[type] ?? '' }
    fireEvent.dragOver(mochiButton(), { dataTransfer })
    fireEvent.drop(mochiButton(), { dataTransfer })
    expect(probe.assistant.session.query).toBe(`¿Con qué acompaño ${BEER.name}?`)
  })

  test('«Buscar con Mochi» abre el buscador', () => {
    render(tree())
    fireEvent.click(mochiButton())
    fireEvent.click(screen.getByRole('button', { name: 'Buscar con Mochi' }))
    expect(probe.assistant.isOpen).toBe(true)
  })
})
