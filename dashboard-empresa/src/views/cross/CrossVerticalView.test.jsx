import { screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { renderWithData, resetApi, serveFixtures } from '../../test/fixtureApi.js'
import { CrossVerticalView } from './CrossVerticalView.jsx'

describe('CrossVerticalView', () => {
  afterEach(resetApi)

  test('muestra sugerencias, afinidad marcada como no usada por el agente y retención por estrato', async () => {
    serveFixtures()
    await renderWithData(<CrossVerticalView source="synthetic" />)

    expect(await screen.findByText('11.659')).toBeTruthy()
    expect(screen.getByText('Aristas aprendidas de datos simulados: solo se ven en el panel. El agente NO las usa.')).toBeTruthy()
    expect(await screen.findByRole('table', { name: 'Afinidad dirigida entre conceptos' })).toBeTruthy()
    expect((await screen.findAllByText('Sin grupo: menos de 20 usuarios')).length).toBeGreaterThan(0)
    expect(screen.getByText(/Supuesto del simulador/)).toBeTruthy()
  })

  test('sin datos del prototipo muestra estados vacíos', async () => {
    serveFixtures()
    await renderWithData(<CrossVerticalView source="prototype" />)

    expect(await screen.findByText('Sin sugerencias que evaluar')).toBeTruthy()
    expect(await screen.findByText('Sin aristas que mostrar')).toBeTruthy()
    expect(await screen.findByText('Sin usuarios elegibles')).toBeTruthy()
  })
})
