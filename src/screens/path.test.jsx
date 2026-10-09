import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import App from '../App.jsx'
import { DATA, conceptsOf } from '../game/data.js'
import { KEY } from '../game/storage.js'
import { seed } from '../test/seed.js'

beforeEach(() => {
  localStorage.clear()
  seed()
})
afterEach(cleanup)

const preload = seed
const path = () => screen.getByRole('region', { name: 'Camino de verticales' })

describe('camino', () => {
  test('muestra la barra de juego, la misión del día y las 8 paradas', () => {
    render(<App />)
    expect(screen.getByText('Nivel 1')).toBeTruthy()
    const mission = screen.getByRole('button', { name: 'Misión del día: 0 de 3' })
    const steps = mission.querySelectorAll('[data-done]')
    expect(steps).toHaveLength(3)
    for (const s of steps) expect(s.getAttribute('data-done')).toBe('false')
    for (const v of DATA.order) {
      expect(within(path()).getByRole('button', { name: `${DATA.labels[v]}: Sin sello` })).toBeTruthy()
    }
  })

  test('Bigotes marca la parada con menos avance', () => {
    const others = Object.fromEntries(DATA.order.filter((v) => v !== 'farmacia').map((v) => [v, [conceptsOf(v)[0].id]]))
    preload({ discovered: others })
    render(<App />)
    const here = path().querySelector('[data-here="true"]')
    expect(here.getAttribute('data-vertical')).toBe('farmacia')
  })

  test('la barra inferior tiene 3 pestañas', () => {
    render(<App />)
    const nav = screen.getByRole('navigation')
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Jugar', 'Pasaporte', 'Álbum'])
  })

  test('tocar una parada abre su ficha con «Jugar»', () => {
    render(<App />)
    fireEvent.click(within(path()).getByRole('button', { name: 'Licores: Sin sello' }))
    const sheet = screen.getByRole('dialog', { name: 'Licores' })
    expect(within(sheet).getByText('+18')).toBeTruthy()
    expect(within(sheet).getByRole('button', { name: 'Jugar' })).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('«Ver conceptos» muestra la colección: los descubiertos abren su ficha y los demás esperan', () => {
    const first = conceptsOf('turbo')[0]
    preload({ discovered: { turbo: [first.id] } })
    render(<App />)
    fireEvent.click(within(path()).getByRole('button', { name: 'Turbo: Explorador' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ver conceptos' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Turbo' })).toBeTruthy()
    expect(screen.getAllByText('?').length).toBe(conceptsOf('turbo').length - 1)
    fireEvent.click(screen.getByRole('button', { name: `${first.emoji} ${first.name}` }))
    expect(screen.getByRole('heading', { level: 1, name: first.name })).toBeTruthy()
  })

  test('«Reiniciar progreso» deja todo en cero después de confirmar', () => {
    preload({ xp: 250 })
    render(<App />)
    expect(screen.getByText('Nivel 3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar progreso' }))
    expect(JSON.parse(localStorage.getItem(KEY)).xp).toBe(250)
    fireEvent.click(screen.getByRole('button', { name: 'Sí, reiniciar' }))
    expect(screen.getByText('Nivel 1')).toBeTruthy()
  })
})
