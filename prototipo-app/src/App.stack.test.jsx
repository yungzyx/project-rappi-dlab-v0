import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { stubApi } from './api/testing'
import App from './App'

vi.mock('./api/client', async (importOriginal) => ({
  ...(await importOriginal()),
  health: vi.fn().mockResolvedValue(null),
}))

beforeAll(() => {
  Element.prototype.scrollTo = () => {} // jsdom no lo implementa
})
afterAll(() => {
  delete Element.prototype.scrollTo
})
beforeEach(() => {
  stubApi({}) // la Home pide su catálogo a la API
  localStorage.setItem('rappi-proto-demo-mode', 'actual')
  window.history.replaceState(null, '', '/')
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

const wraps = () => [...document.querySelectorAll('.screen-wrap')]

describe('pila de pantallas montada', () => {
  test('al volver, el buscador conserva su texto y la Home nunca se desmontó', async () => {
    render(<App />)
    const home = wraps()[0]
    fireEvent.click(screen.getByLabelText('Buscar'))
    expect(wraps()).toHaveLength(2)
    expect(wraps()[0]).toBe(home)
    expect(home.classList.contains('is-under')).toBe(true)
    expect(home.hasAttribute('inert')).toBe(true)

    // Las pantallas (salvo la Home) se bajan al abrirse: se espera a que el buscador aparezca.
    const input = await screen.findByPlaceholderText('What do you want today?')
    fireEvent.change(input, { target: { value: 'unimarc' } })
    fireEvent.click(document.querySelector('.search-store'))
    expect(wraps()).toHaveLength(3)
    expect(wraps()[1].hasAttribute('inert')).toBe(true)
    await screen.findByRole('heading', { level: 1 }) // la tienda ya cargó

    // Volver (como el gesto del navegador): la entrada de historial anterior es la del buscador.
    const searchEntry = {
      nav: {
        stack: [
          { name: 'home', params: {} },
          { name: 'search', params: {} },
        ],
        homeTab: 'home',
      },
    }
    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: searchEntry })))
    expect(wraps()).toHaveLength(2)
    expect(screen.getByPlaceholderText('What do you want today?').value).toBe('unimarc')
    expect(wraps()[1].hasAttribute('inert')).toBe(false)
    expect(wraps()[0]).toBe(home)
  })
})
