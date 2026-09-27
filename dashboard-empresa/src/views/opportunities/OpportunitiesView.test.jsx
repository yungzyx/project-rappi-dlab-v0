import { screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { renderWithData, resetApi, serveFixtures } from '../../test/fixtureApi.js'
import { OpportunitiesView } from './OpportunitiesView.jsx'

describe('OpportunitiesView', () => {
  afterEach(resetApi)

  test('muestra la demanda no satisfecha rankeada y los conceptos que suben y bajan', async () => {
    serveFixtures()
    await renderWithData(<OpportunitiesView source="synthetic" />)

    expect(await screen.findByText('«kombucha»')).toBeTruthy()
    expect(screen.getAllByText('Oportunidad: sumar comercios o categoría')).toHaveLength(3)
    expect(await screen.findByText('Suben · 5')).toBeTruthy()
    expect(screen.getByText('Bajan · 7')).toBeTruthy()
    // Peruana sube, pero no tiene oferta: se marca.
    expect(screen.getAllByText('sin oferta').length).toBeGreaterThan(0)
  })

  test('sin datos del prototipo muestra estados vacíos', async () => {
    serveFixtures()
    await renderWithData(<OpportunitiesView source="prototype" />)

    expect(await screen.findByText('Sin demanda no satisfecha que mostrar')).toBeTruthy()
    expect(await screen.findByText('Sin tendencias que mostrar')).toBeTruthy()
  })
})
