import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { renderWithData, resetApi, serveFixtures } from '../../test/fixtureApi.js'
import { SummaryView } from './SummaryView.jsx'
import { formatNumber, formatPct } from '../../lib/format.js'
import kpis from '../../fixtures/kpis.synthetic.json'

describe('SummaryView', () => {
  afterEach(resetApi)

  test('con datos simulados muestra qué hacer, los indicadores y la serie semanal', async () => {
    serveFixtures()
    const onNavigate = vi.fn()
    await renderWithData(<SummaryView source="synthetic" onNavigate={onNavigate} />)

    expect(await screen.findByText('3 decisiones que salen de los datos')).toBeTruthy()
    expect(screen.getByText('🇵🇪 Comida peruana en Restaurantes')).toBeTruthy()
    expect(await screen.findByText(formatNumber(kpis.data.usuarios_activos))).toBeTruthy()
    expect(screen.getByText(formatPct(kpis.data.abandono_carrito_pct))).toBeTruthy()
    expect(await screen.findAllByRole('img', { name: /por semana/ })).toHaveLength(4)

    fireEvent.click(screen.getByRole('button', { name: /Ver oportunidades/ }))
    expect(onNavigate).toHaveBeenCalledWith('oportunidades')
  })

  test('con los datos del prototipo muestra estados vacíos en vez de fallar', async () => {
    serveFixtures()
    await renderWithData(<SummaryView source="prototype" onNavigate={() => {}} />)

    expect(await screen.findByText('Sin señales suficientes')).toBeTruthy()
    expect((await screen.findAllByText('Sin datos suficientes en esta fuente.')).length).toBeGreaterThan(0)
    expect(await screen.findByText('Todavía no hay semanas suficientes')).toBeTruthy()
  })
})
