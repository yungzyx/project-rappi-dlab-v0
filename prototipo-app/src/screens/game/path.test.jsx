import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { gameServer, stubApi } from '../../api/testing'
import { GameApp as App, mount } from './GameApp.testkit.jsx'
import { cardsOf, datosOf } from '../../game/knowledge.js'
import { LABELS, PASSPORT_ORDER } from '../../game/verticals.js'
import { seed } from '../../game/testSeed.js'

beforeEach(() => {
  localStorage.clear()
  stubApi({})
  seed()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const preload = seed
const path = () => screen.getByRole('region', { name: 'Camino de verticales' })

describe('camino', () => {
  test('muestra la barra de juego, la misión del día y las 9 paradas', async () => {
    await mount(<App />)
    expect(screen.getByText('Nivel 1')).toBeTruthy()
    const mission = screen.getByRole('button', { name: 'Misión del día: 0 de 3' })
    const steps = mission.querySelectorAll('[data-done]')
    expect(steps).toHaveLength(3)
    for (const s of steps) expect(s.getAttribute('data-done')).toBe('false')
    for (const v of PASSPORT_ORDER) {
      expect(within(path()).getByRole('button', { name: new RegExp(`^${LABELS[v]}: Sin sello`) })).toBeTruthy()
    }
  })

  test('Mochi marca la parada con menos avance', async () => {
    const others = Object.fromEntries(PASSPORT_ORDER.filter((v) => v !== 'farmacia').map((v) => [v, [cardsOf(v)[0].id]]))
    preload({ discovered: others })
    await mount(<App />)
    const here = path().querySelector('[data-here="true"]')
    expect(here.getAttribute('data-vertical')).toBe('farmacia')
  })

  test('la barra inferior tiene 3 pestañas', async () => {
    await mount(<App />)
    const nav = screen.getByRole('navigation')
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Jugar', 'Pasaporte', 'Álbum'])
  })

  test('tocar una parada abre su ficha con «Jugar»', async () => {
    await mount(<App />)
    fireEvent.click(within(path()).getByRole('button', { name: /^Licores: Sin sello/ }))
    const sheet = screen.getByRole('dialog', { name: 'Licores' })
    expect(within(sheet).getByText('+18')).toBeTruthy()
    expect(within(sheet).getByRole('button', { name: 'Jugar' })).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('«Ver datos» muestra las 12 tarjetas de la vertical: las descubiertas con su texto y las demás como «?»', async () => {
    const first = datosOf('turbo')[0]
    preload({ discovered: { turbo: [first.id] }, cards: [first.id], opened: [first.id] })
    await mount(<App />)
    fireEvent.click(within(path()).getByRole('button', { name: /^Turbo: Explorador/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Ver datos' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Turbo' })).toBeTruthy()
    expect(screen.getByText('1 de 12 datos descubiertos')).toBeTruthy()
    expect(screen.getByText(first.text)).toBeTruthy()
    expect(document.querySelectorAll('.fact-card.is-locked')).toHaveLength(11)
  })

  test('«Reiniciar progreso» deja todo en cero después de confirmar', async () => {
    preload({ xp: 250 })
    await mount(<App />)
    expect(screen.getByText('Nivel 3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar progreso' }))
    await act(async () => {})
    expect(gameServer.puts).toEqual([]) // sin confirmar, no se guarda nada y el servidor sigue con su progreso
    expect(gameServer.state.xp).toBe(250)
    fireEvent.click(screen.getByRole('button', { name: 'Sí, reiniciar' }))
    expect(screen.getByText('Nivel 1')).toBeTruthy()
  })
})
