import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import App from '../App.jsx'
import { DATA, conceptsOf } from '../game/data.js'
import { FACTS } from '../game/facts.js'
import { initialState, today } from '../game/progress.js'
import { KEY } from '../game/storage.js'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

const stored = () => JSON.parse(localStorage.getItem(KEY))
const preload = (patch) => localStorage.setItem(KEY, JSON.stringify({ ...initialState(), ...patch }))
const tab = (name) => fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name }))

describe('mapa con niebla', () => {
  test('8 verticales y 107 puntos, todos apagados al empezar', () => {
    render(<App />)
    tab('Mapa')
    const map = screen.getByRole('region', { name: 'Mapa de verticales' })
    for (const v of DATA.order)
      expect(within(map).getByRole('button', { name: new RegExp(DATA.labels[v]) })).toBeTruthy()
    const dots = map.querySelectorAll('[data-concept]')
    expect(dots).toHaveLength(107)
    expect(map.querySelectorAll('[data-lit="true"]')).toHaveLength(0)
  })

  test('un concepto descubierto se enciende', () => {
    const id = conceptsOf('turbo')[0].id
    preload({ discovered: { turbo: [id] } })
    render(<App />)
    tab('Mapa')
    const lit = screen.getByRole('region', { name: 'Mapa de verticales' }).querySelectorAll('[data-lit="true"]')
    expect(lit).toHaveLength(1)
    expect(lit[0].getAttribute('data-concept')).toBe(id)
    expect(screen.getByText('Descubriste 1 de 107 conceptos')).toBeTruthy()
  })

  test('tocar una vertical del mapa la abre', () => {
    render(<App />)
    tab('Mapa')
    fireEvent.click(screen.getByRole('button', { name: /Farmacia/ }))
    expect(screen.getByRole('heading', { level: 1, name: 'Farmacia' })).toBeTruthy()
  })
})

describe('pasaporte', () => {
  test('muestra los 8 sellos y Conoce Rappi bloqueado', () => {
    render(<App />)
    tab('Pasaporte')
    const stamps = screen.getAllByRole('button', { name: /Sin sello/ })
    expect(stamps).toHaveLength(8)
    expect(screen.getByRole('region', { name: 'Conoce Rappi' }).getAttribute('data-earned')).toBe('false')
  })

  test('Conoce Rappi se gana con las 8 en Conocedor', () => {
    const discovered = Object.fromEntries(
      DATA.order.map((v) => [
        v,
        conceptsOf(v)
          .slice(0, Math.ceil(conceptsOf(v).length / 2))
          .map((c) => c.id),
      ]),
    )
    const correct = Object.fromEntries(DATA.order.map((v) => [v, 3]))
    preload({ discovered, correct })
    render(<App />)
    tab('Pasaporte')
    expect(screen.getAllByRole('button', { name: /Conocedor/ })).toHaveLength(8)
    expect(screen.getByRole('region', { name: 'Conoce Rappi' }).getAttribute('data-earned')).toBe('true')
  })
})

describe('álbum', () => {
  test('muestra todas las cartas y las bloqueadas no se pueden abrir', () => {
    render(<App />)
    tab('Álbum')
    expect(document.querySelectorAll('.fact-card')).toHaveLength(FACTS.length)
    expect(document.querySelectorAll('.fact-card.is-locked')).toHaveLength(FACTS.length)
    expect(screen.getByText(`0 de ${FACTS.length} cartas`)).toBeTruthy()
  })

  test('abrir una carta desbloqueada la muestra y cuenta para la misión del día', () => {
    const card = FACTS[0]
    preload({ cards: [card.id] })
    render(<App />)
    tab('Álbum')
    expect(screen.queryByText(card.text)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: `Leer carta: ${card.title}` }))
    expect(screen.getByText(card.text)).toBeTruthy()
    expect(stored().opened).toEqual([card.id])
    expect(stored().daily).toMatchObject({ date: today(), opened: 1 })
  })
})
