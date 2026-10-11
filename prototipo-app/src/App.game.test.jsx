import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { fixture, stubApi } from './api/testing'
import { gameReady } from './game/testSeed.js'
import App from './App'

vi.mock('./api/client', async (importOriginal) => ({
  ...(await importOriginal()),
  health: vi.fn().mockResolvedValue(null),
}))

beforeAll(() => {
  Element.prototype.scrollTo = () => {}
})
afterAll(() => {
  delete Element.prototype.scrollTo
})
beforeEach(() => {
  localStorage.setItem('rappi-proto-demo-mode', 'actual')
  localStorage.setItem('rappi-proto-privacy-seen', '1')
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

const routes = (cards) => ({
  '/search': fixture('search-grouped'),
  '/catalog/home': fixture('catalog-home'),
  'GET /game/cards': cards,
})

describe('una caída del juego no bota la tienda', () => {
  test('con /game/cards en 500 la Home se pinta y el pasaporte ofrece Reintentar', async () => {
    let online = false
    stubApi(routes(() => (online ? { cards: fixture('game-cards').cards } : 500)))
    window.history.replaceState(null, '', '/')
    render(<App />)
    await gameReady()
    // La Home y el buscador siguen ahí aunque el juego no cargó.
    expect(screen.getByLabelText('Buscar')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    cleanup()

    // Abierto el juego directamente: su propio aviso, sin tapar la app, con «Reintentar».
    window.history.replaceState(null, '', '/#/game')
    render(<App />)
    await gameReady()
    const notice = await screen.findByRole('alert')
    expect(notice.tagName).toBe('SECTION') // no un segundo <main> dentro del escenario
    expect(notice.textContent).toMatch(/Sin conexión/)
    expect(screen.queryByRole('button', { name: /Pasaporte/ })).toBeNull()

    online = true
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('button', { name: /Pasaporte/ })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('aviso de privacidad en la app', () => {
  test('la primera visita lo muestra y «Ir a Cuenta» abre Cuenta con «Borrar mis datos»', async () => {
    localStorage.removeItem('rappi-proto-privacy-seen')
    stubApi(routes({ cards: fixture('game-cards').cards }))
    window.history.replaceState(null, '', '/')
    render(<App />)
    await gameReady()
    expect(screen.getByText(/guardamos tus búsquedas/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ir a Cuenta' }))
    expect(screen.queryByText(/guardamos tus búsquedas/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Borrar mis datos' })).toBeTruthy()
  })
})
