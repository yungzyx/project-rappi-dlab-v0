import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import App from '../App.jsx'
import { makeChallenge } from '../game/challenges.js'
import { DATA, conceptsOf, related } from '../game/data.js'
import { factsOf } from '../game/facts.js'
import { initialState } from '../game/progress.js'
import { KEY } from '../game/storage.js'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

const stored = () => JSON.parse(localStorage.getItem(KEY))
const preload = (patch) => localStorage.setItem(KEY, JSON.stringify({ ...initialState(), ...patch }))

/** Con el progreso vacío «Seguir explorando» abre Súper (la primera del mapa). */
function openSuper() {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Seguir explorando' }))
}

describe('vertical y ficha', () => {
  test('tocar un concepto por descubrir abre su ficha y suma 10 XP', () => {
    openSuper()
    const first = conceptsOf('supermercado')[0]
    fireEvent.click(screen.getAllByRole('button', { name: 'Descubrir un concepto' })[0])
    expect(screen.getByRole('heading', { level: 1, name: first.name })).toBeTruthy()
    expect(screen.getByText('+10 XP')).toBeTruthy()
    expect(stored().xp).toBe(10)
    const complements = [...related(first.id).complements]
    if (complements.length) expect(screen.getByRole('region', { name: 'Combina con' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(screen.getByRole('button', { name: `${first.emoji} ${first.name}` })).toBeTruthy()
  })

  test('volver a abrir un concepto descubierto no suma de nuevo', () => {
    openSuper()
    fireEvent.click(screen.getAllByRole('button', { name: 'Descubrir un concepto' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    const first = conceptsOf('supermercado')[0]
    fireEvent.click(screen.getByRole('button', { name: `${first.emoji} ${first.name}` }))
    expect(screen.queryByText('+10 XP')).toBeNull()
    expect(stored().xp).toBe(10)
  })
})

describe('desafío y resultado', () => {
  test('acertar suma 20 XP y desbloquea una carta', () => {
    openSuper()
    fireEvent.click(screen.getByRole('button', { name: 'Desafío' }))
    const ch = makeChallenge('supermercado', '0')
    expect(screen.getByText(ch.question)).toBeTruthy()
    const options = within(screen.getByRole('group', { name: 'Opciones' })).getAllByRole('button')
    expect(options).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: ch.options.find((o) => o.id === ch.answer).label }))
    expect(screen.getByText('¡Correcto!')).toBeTruthy()
    expect(screen.getByText('+20 XP')).toBeTruthy()
    expect(screen.getByText(factsOf('supermercado')[0].text)).toBeTruthy()
    expect(stored().cards).toEqual([factsOf('supermercado')[0].id])
  })

  test('errar muestra la explicación y suma 5 XP', () => {
    openSuper()
    fireEvent.click(screen.getByRole('button', { name: 'Desafío' }))
    const ch = makeChallenge('supermercado', '0')
    fireEvent.click(screen.getByRole('button', { name: ch.options.find((o) => o.id !== ch.answer).label }))
    expect(screen.getByText('Casi')).toBeTruthy()
    expect(screen.getByText('+5 XP')).toBeTruthy()
    expect(screen.getByText(ch.explanation)).toBeTruthy()
  })

  test('el desafío siguiente usa otra semilla', () => {
    openSuper()
    fireEvent.click(screen.getByRole('button', { name: 'Desafío' }))
    const first = makeChallenge('supermercado', '0')
    fireEvent.click(screen.getByRole('button', { name: first.options[0].label }))
    fireEvent.click(screen.getByRole('button', { name: 'Otro desafío' }))
    expect(screen.getByText(makeChallenge('supermercado', '1').question)).toBeTruthy()
  })

  test('subir a Conocedor muestra el sello nuevo', () => {
    const v = 'chocolateria'
    const half = conceptsOf(v).slice(0, 5).map((c) => c.id)
    // Las demás verticales completas: así Chocolatería es la de menor avance y «Seguir explorando» la abre.
    const others = Object.fromEntries(
      DATA.order.filter((x) => x !== v).map((x) => [x, conceptsOf(x).map((c) => c.id)]),
    )
    preload({ discovered: { ...others, [v]: half }, correct: { [v]: 2 }, answered: { [v]: 2 } })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Seguir explorando' }))
    expect(screen.getByRole('heading', { level: 1, name: DATA.labels[v] })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Desafío' }))
    const ch = makeChallenge(v, '2')
    fireEvent.click(screen.getByRole('button', { name: ch.options.find((o) => o.id === ch.answer).label }))
    expect(screen.getByText(`Nuevo sello: Conocedor de ${DATA.labels[v]}`)).toBeTruthy()
  })

  test('Licores lleva la marca +18', () => {
    const others = Object.fromEntries(
      DATA.order.filter((x) => x !== 'licores').map((x) => [x, [conceptsOf(x)[0].id]]),
    )
    preload({ discovered: others })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Seguir explorando' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Licores' })).toBeTruthy()
    expect(screen.getByText('+18')).toBeTruthy()
  })
})
