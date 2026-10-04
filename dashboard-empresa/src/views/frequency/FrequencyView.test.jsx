import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { renderWithData, resetApi, serveFixtures } from '../../test/fixtureApi.js'
import { FrequencyView } from './FrequencyView.jsx'
import { formatNumber } from '../../lib/format.js'
import atRisk from '../../fixtures/at-risk.synthetic.json'
import cohorts from '../../fixtures/cohorts.synthetic.json'

describe('FrequencyView', () => {
  afterEach(resetApi)

  test('muestra embudo, cohortes, ritmo y la lista de riesgo', async () => {
    serveFixtures()
    await renderWithData(<FrequencyView source="synthetic" />)

    expect(await screen.findByText('Restaurantes')).toBeTruthy()
    expect(screen.getAllByText(/Mayor pérdida del carro al pago/)).toHaveLength(6)
    expect(await screen.findByRole('img', { name: /Retención por cohorte semanal/ })).toBeTruthy()
    expect(await screen.findByRole('group', { name: /ritmo de compra/ })).toBeTruthy()

    const table = await screen.findByRole('table', { name: 'Usuarios en riesgo o perdidos' })
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 12)
    // La API entrega primero a los "en riesgo" (recuperables): no hace falta el aviso de que no aparecen.
    expect(atRisk.data[0].estado).toBe('en_riesgo')
    expect(screen.queryByText(/no alcanzan a aparecer/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: `Ver los ${formatNumber(atRisk.data.length)}` }))
    expect(within(table).getAllByRole('row')).toHaveLength(1 + atRisk.data.length)
  })

  test('la semana que la API no calculó sale vacía y no en 0%', async () => {
    // Hoy el corte de los datos guardados cae en domingo (27-09): la API deja fuera la semana del 21 al 27-09.
    serveFixtures()
    await renderWithData(<FrequencyView source="synthetic" />)

    const card = await screen.findByRole('region', { name: 'Retención por cohorte semanal' })
    fireEvent.click(within(card).getByRole('button', { name: 'Ver tabla' }))
    const lastCohort = cohorts.data.at(-1).cohorte
    const lastWeek = Math.max(...cohorts.data.filter((row) => row.cohorte === lastCohort).map((row) => row.semana))
    const cells = within(within(card).getAllByRole('row').at(-1)).getAllByRole('cell')

    // Columnas: cohorte, usuarios, S0, S1…
    expect(cells[2 + lastWeek + 1].textContent).toBe('—')
  })

  test('sin datos del prototipo muestra estados vacíos', async () => {
    serveFixtures()
    await renderWithData(<FrequencyView source="prototype" />)

    expect(await screen.findByText('Sin cohortes')).toBeTruthy()
    expect(await screen.findByText('Nadie en riesgo ni perdido')).toBeTruthy()
  })
})
