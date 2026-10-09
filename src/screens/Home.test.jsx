import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import App from '../App.jsx'
import { DATA } from '../game/data.js'
import { dailyVertical, today } from '../game/progress.js'
import { KEY } from '../game/storage.js'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('Inicio', () => {
  test('muestra el nivel, la misión del día y la vertical destacada', () => {
    render(<App />)
    expect(screen.getByText('Nivel 1')).toBeTruthy()
    const mission = screen.getByRole('region', { name: 'Misión del día' })
    const steps = within(mission).getAllByRole('listitem')
    expect(steps).toHaveLength(3)
    for (const step of steps) expect(step.getAttribute('data-done')).toBe('false')
    expect(mission.querySelector('.home-featured').textContent).toBe(DATA.labels[dailyVertical(today())])
  })

  test('«Seguir explorando» abre una vertical', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Seguir explorando' }))
    expect(screen.getByRole('heading', { level: 1, name: DATA.labels.supermercado })).toBeTruthy()
  })

  test('la barra inferior cambia de pestaña', () => {
    render(<App />)
    const nav = screen.getByRole('navigation')
    for (const name of ['Inicio', 'Mapa', 'Pasaporte', 'Álbum'])
      expect(within(nav).getByRole('button', { name })).toBeTruthy()
  })

  test('«Reiniciar progreso» deja todo en cero después de confirmar', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ version: 1, xp: 250, discovered: {}, correct: {}, answered: {}, cards: [], opened: [] }),
    )
    render(<App />)
    expect(screen.getByText('Nivel 3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar progreso' }))
    expect(screen.getByRole('alertdialog', { name: 'Confirmar reinicio' })).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(KEY)).xp).toBe(250)
    fireEvent.click(screen.getByRole('button', { name: 'Sí, reiniciar' }))
    expect(screen.getByText('Nivel 1')).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{"xp":0}').xp).toBe(0)
  })
})
