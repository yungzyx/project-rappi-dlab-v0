import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { renderWithData, resetApi, serveFixtures } from '../../test/fixtureApi.js'
import { OpportunitiesView } from './OpportunitiesView.jsx'
import { UnmetDemand } from './UnmetDemand.jsx'
import opportunities from '../../fixtures/opportunities.synthetic.json'

const rows = opportunities.data

describe('OpportunitiesView', () => {
  afterEach(resetApi)

  test('muestra la demanda no satisfecha rankeada y los conceptos que suben y bajan', async () => {
    serveFixtures()
    await renderWithData(<OpportunitiesView source="synthetic" />)

    expect(await screen.findByText('«kombucha»')).toBeTruthy()
    const action = 'Oportunidad: sumar comercios o categoría'
    expect(screen.getAllByText(action)).toHaveLength(rows.filter((row) => row.accion === action).length)
    expect(await screen.findByText(/^Suben · [1-9]/)).toBeTruthy()
    expect(screen.getByText(/^Bajan · [1-9]/)).toBeTruthy()
    // Peruana sube, pero no tiene oferta: se marca.
    expect(screen.getAllByText('sin oferta').length).toBeGreaterThan(0)
  })

  test('el titular suma búsquedas, no usuarios (un usuario aparece en varias filas)', async () => {
    serveFixtures()
    await renderWithData(<OpportunitiesView source="synthetic" />)

    const total = (field) => rows.reduce((sum, row) => sum + row[field], 0).toLocaleString('es-CL')
    expect(await screen.findByText(total('busquedas'))).toBeTruthy()
    expect(screen.getByText('búsquedas sin resultado')).toBeTruthy()
    expect(screen.queryByText(total('usuarios'))).toBeNull()
  })

  test('«nueva» solo si hubo búsquedas recientes; sin ellas, sin actividad', () => {
    const row = { vertical: 'mall', concept_id: 'auto', que: '🚗 Auto', busquedas: 9, usuarios: 6, crecimiento_pct: null }
    render(
      <UnmetDemand
        rows={[
          { ...row, recientes: 4, anteriores: 0 },
          { ...row, concept_id: 'bici', que: '🚲 Bici', recientes: 0, anteriores: 0 },
        ]}
      />,
    )

    expect(screen.getAllByText('nueva')).toHaveLength(1)
    expect(screen.getAllByText('sin actividad en 4 semanas')).toHaveLength(1)
  })

  test('sin datos del prototipo muestra estados vacíos', async () => {
    serveFixtures()
    await renderWithData(<OpportunitiesView source="prototype" />)

    expect(await screen.findByText('Sin demanda no satisfecha que mostrar')).toBeTruthy()
    expect(await screen.findByText('Sin tendencias que mostrar')).toBeTruthy()
  })
})
