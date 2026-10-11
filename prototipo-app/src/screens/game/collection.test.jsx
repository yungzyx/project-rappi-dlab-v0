import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { stubApi } from '../../api/testing'
import { GameApp as App, mount } from './GameApp.testkit.jsx'
import { PASSPORT_ORDER } from '../../game/verticals.js'
import { DATA } from '../../game/data.js'
import { KNOWLEDGE, cardsOf, datosOf, preguntasOf } from '../../game/knowledge.js'
import { LABELS } from '../../game/verticals.js'
import { today } from '../../game/progress.js'
import { seed, stored } from '../../game/testSeed.js'

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
const tab = (name) =>
  fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: new RegExp(`^${name}`) }))

describe('mapa con niebla (en el pasaporte)', () => {
  test('108 puntos (uno por tarjeta), todos apagados al empezar, y las 9 verticales', async () => {
    await mount(<App />)
    tab('Pasaporte')
    const map = screen.getByRole('region', { name: 'Mapa de verticales' })
    for (const v of PASSPORT_ORDER) expect(within(map).getByText(LABELS[v])).toBeTruthy()
    expect(map.querySelectorAll('[data-card]')).toHaveLength(108)
    expect(map.querySelectorAll('[data-lit="true"]')).toHaveLength(0)
  })

  test('una tarjeta descubierta se enciende', async () => {
    const id = datosOf('turbo')[0].id
    preload({ discovered: { turbo: [id] } })
    await mount(<App />)
    tab('Pasaporte')
    const lit = screen.getByRole('region', { name: 'Mapa de verticales' }).querySelectorAll('[data-lit="true"]')
    expect(lit).toHaveLength(1)
    expect(lit[0].getAttribute('data-card')).toBe(id)
    expect(screen.getByText('Descubriste 1 de 108 datos')).toBeTruthy()
  })
})

describe('pasaporte', () => {
  test('muestra los 9 sellos y Conoce Rappi bloqueado', async () => {
    await mount(<App />)
    tab('Pasaporte')
    const stamps = within(screen.getByRole('region', { name: 'Sellos' })).getAllByRole('button', { name: /Sin sello/ })
    expect(stamps).toHaveLength(9)
    const special = screen.getByRole('region', { name: 'Conoce Rappi' })
    expect(special.getAttribute('data-earned')).toBe('false')
    expect(special.textContent).toContain('Llega a Conocedor en las 9 verticales.')
  })

  test('Conoce Rappi se gana con las 9 en Conocedor', async () => {
    const discovered = Object.fromEntries(
      PASSPORT_ORDER.map((v) => [
        v,
        cardsOf(v)
          .slice(0, 6)
          .map((c) => c.id),
      ]),
    )
    const correct = Object.fromEntries(PASSPORT_ORDER.map((v) => [v, 3]))
    preload({ discovered, correct })
    await mount(<App />)
    tab('Pasaporte')
    expect(
      within(screen.getByRole('region', { name: 'Sellos' })).getAllByRole('button', { name: /Conocedor/ }),
    ).toHaveLength(9)
    const special = screen.getByRole('region', { name: 'Conoce Rappi' })
    expect(special.getAttribute('data-earned')).toBe('true')
    expect(special.textContent).toContain('Llegaste a Conocedor en las 9 verticales.')
  })
})

describe('álbum', () => {
  test('muestra las 108 tarjetas por vertical, las que faltan como «?»', async () => {
    await mount(<App />)
    tab('Álbum')
    expect(document.querySelectorAll('.fact-card')).toHaveLength(KNOWLEDGE.length)
    expect(document.querySelectorAll('.fact-card.is-locked')).toHaveLength(KNOWLEDGE.length)
    expect(screen.getByText(`0 de ${KNOWLEDGE.length} datos`)).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Viajes' })).toBeTruthy()
  })

  test('cada pregunta cerrada del álbum tiene su propia etiqueta (con la pregunta)', async () => {
    const preguntas = preguntasOf('licores')
    const ids = preguntas.map((c) => c.id)
    preload({ discovered: { licores: ids }, cards: ids })
    await mount(<App />)
    tab('Álbum')
    const labels = screen.getAllByRole('button', { name: /^Leer tarjeta: Pregunta curiosa/ }).map((b) => b.getAttribute('aria-label'))
    expect(new Set(labels).size).toBe(preguntas.length)
    expect(labels[0]).toContain(preguntas[0].question)
  })

  test('abrir una tarjeta del álbum la muestra con «Fuente: …» y cuenta para la misión del día', async () => {
    const card = datosOf('turbo')[0]
    preload({ discovered: { turbo: [card.id] }, cards: [card.id] })
    await mount(<App />)
    tab('Álbum')
    expect(screen.queryByText(card.text)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: `Leer tarjeta: ${card.title}` }))
    expect(screen.getByText(card.text)).toBeTruthy()
    expect(screen.getByRole('link', { name: card.source.title }).getAttribute('target')).toBe('_blank')
    await waitFor(() => expect(stored().opened).toEqual([card.id]))
    await waitFor(() => expect(stored().daily).toMatchObject({ date: today(), opened: 1 }))
  })
})
