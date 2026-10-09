import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { renderWithData, resetApi, serveFixtures } from '../../test/fixtureApi.js'
import { CrossVerticalView } from './CrossVerticalView.jsx'
import { formatNumber } from '../../lib/format.js'
import suggestions from '../../fixtures/suggestions.synthetic.json'
import services from '../../fixtures/services.synthetic.json'

describe('CrossVerticalView', () => {
  afterEach(resetApi)

  test('muestra sugerencias, afinidad marcada como no usada por el agente y retención por estrato', async () => {
    serveFixtures()
    await renderWithData(<CrossVerticalView source="synthetic" />)

    const shown = suggestions.data.reduce((total, row) => total + (row.mostradas ?? 0), 0)
    expect(await screen.findByText(formatNumber(shown))).toBeTruthy()
    expect(screen.getByText('Aristas aprendidas de datos simulados: solo se ven en el panel. El agente NO las usa.')).toBeTruthy()
    expect(await screen.findByRole('table', { name: 'Afinidad dirigida entre conceptos' })).toBeTruthy()
    expect((await screen.findAllByText('Sin grupo: menos de 20 usuarios')).length).toBeGreaterThan(0)
    expect(screen.getByText(/Supuesto del simulador/)).toBeTruthy()
    const servicesTable = await screen.findByRole('table', { name: 'Servicios sin catálogo' })
    const travel = services.data.find((row) => row.servicio === 'rappitravel')
    expect(within(servicesTable).getByText('✈️ RappiTravel')).toBeTruthy()
    expect(within(servicesTable).getByText(`${formatNumber(travel.ganchos_aceptados)} de ${formatNumber(travel.ganchos_mostrados)}`)).toBeTruthy()
  })

  test('en una demo en vivo el titular cuenta las sugerencias sin inventar un porcentaje', async () => {
    serveFixtures()
    const fixtures = globalThis.fetch
    const demo = [{ concepto: '🥤 Bebidas gaseosas', vertical: 'licores', mostradas: 2, aceptadas: 1, ignoradas: 0, convertidas: 1, aceptacion_pct: null }]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) =>
        url.includes('/analytics/suggestions')
          ? { ok: true, status: 200, json: async () => ({ source: 'prototype', data: demo }) }
          : fixtures(url),
      ),
    )
    await renderWithData(<CrossVerticalView source="prototype" />)

    expect(await screen.findByText('sugerencias cruzadas mostradas')).toBeTruthy()
    expect(screen.queryByText('de las sugerencias cruzadas se aceptan')).toBeNull()
  })

  test('sin datos del prototipo muestra estados vacíos', async () => {
    serveFixtures()
    await renderWithData(<CrossVerticalView source="prototype" />)

    expect(await screen.findByText('Sin sugerencias que evaluar')).toBeTruthy()
    expect(await screen.findByText('Sin aristas que mostrar')).toBeTruthy()
    expect(await screen.findByText('Sin usuarios elegibles')).toBeTruthy()
  })
})
