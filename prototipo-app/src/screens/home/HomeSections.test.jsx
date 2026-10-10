import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest'
import { ToastProvider } from '../../components/Toast'
import { MAIN_TILES, SHORTCUTS } from '../../data/home'
import { Promos, Shortcuts } from './HomeSections'

beforeAll(() => {
  Element.prototype.scrollTo = () => {} // jsdom no lo implementa (carruseles)
})
afterAll(() => {
  delete Element.prototype.scrollTo
})
afterEach(cleanup)

const activeDot = () =>
  [...document.querySelectorAll('.home-promo-dots .dot')].findIndex((dot) => dot.classList.contains('is-active'))

test('los puntos de las promos siguen al carrusel y cada promo tiene nombre accesible', () => {
  const push = vi.fn()
  render(<Promos push={push} autoplayMs={0} />, { wrapper: ToastProvider })
  expect(activeDot()).toBe(1) // parte en la segunda promo, como en la captura
  fireEvent.scroll(document.querySelector('.home-promos')) // en jsdom todo mide 0: queda en la primera
  expect(activeDot()).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'Descuentos en restaurantes' }))
  expect(push).toHaveBeenCalledWith('restaurants')
})

test('RappiFavor abre solo con `proposal` (el prototipo final); hoy sigue no disponible', () => {
  const push = vi.fn()
  const { unmount } = render(<Shortcuts push={push} />, { wrapper: ToastProvider })
  expect(screen.getByLabelText('RappiFavor (no disponible)')).toBeTruthy()
  unmount()
  render(<Shortcuts push={push} proposal />, { wrapper: ToastProvider })
  fireEvent.click(screen.getByText('RappiFavor'))
  expect(push).toHaveBeenCalledWith('favor')
})

test('no hay atajo a Mascotas', () => {
  expect(SHORTCUTS.map((item) => item.id)).not.toContain('pet')
  const push = vi.fn()
  render(<Shortcuts push={push} />, { wrapper: ToastProvider })
  expect(screen.queryByText(/^(Pet|Mascotas)$/)).toBeNull()
  for (const button of document.querySelectorAll('.home-shortcut')) fireEvent.click(button)
  expect(push.mock.calls.map(([, params]) => params?.id)).not.toContain('pet')
  for (const tile of [...MAIN_TILES, ...SHORTCUTS]) expect(tile.route?.[1]?.id).not.toBe('pet')
})
