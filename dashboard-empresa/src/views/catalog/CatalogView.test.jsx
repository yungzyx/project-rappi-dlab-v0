import { screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { renderWithData, resetApi, serveFixtures } from '../../test/fixtureApi.js'
import { formatNumber } from '../../lib/format.js'
import saved from '../../fixtures/catalog.json'
import assortment from '../../fixtures/assortment.synthetic.json'
import { CatalogView } from './CatalogView.jsx'

// El catálogo real cambia con cada corrida del scraper: el total se toma de la respuesta guardada.
const crossTotal = saved.data.cruzados_reales.reduce((sum, row) => sum + row.productos, 0)

describe('CatalogView', () => {
  afterEach(resetApi)

  test('marca el catálogo como real y el surtido vs demanda como demanda simulada', async () => {
    serveFixtures()
    await renderWithData(<CatalogView source="synthetic" />)

    expect(screen.getAllByText('Real · rappi.cl')).toHaveLength(1)
    expect(screen.getByText('Demanda simulada')).toBeTruthy()
    const mismatched = saved.data.cobertura.filter((row) => row.declarados > 0 && row.obtenidos > row.declarados)
    expect(screen.queryAllByText('No calza')).toHaveLength(mismatched.length)
    expect(await screen.findByRole('table', { name: 'Calidad del catálogo por vertical' })).toBeTruthy()
    expect(await screen.findByText(formatNumber(crossTotal))).toBeTruthy()
    const withoutOffer = assortment.data.filter((row) => row.items_en_catalogo === 0)
    expect(screen.queryAllByText('sin oferta')).toHaveLength(withoutOffer.length)
  })

  test('la nota de productos cruzados da el efecto medido de las tiendas con doble etiqueta', async () => {
    serveFixtures()
    await renderWithData(<CatalogView source="synthetic" />)

    const note = (await screen.findByText(/contando solo tiendas de un único vertical/)).textContent
    // Con el catálogo del 30-09: 18.839 con esas tiendas y 16.505 sin ellas (no «casi se duplica»).
    expect(note).not.toMatch(/duplica/)
    expect(note).toMatch(/sube un 14%/)
  })

  test('con la fuente del prototipo la demanda se marca como del prototipo', async () => {
    serveFixtures()
    await renderWithData(<CatalogView source="prototype" />)

    expect(screen.getByText('Demanda del prototipo')).toBeTruthy()
    expect(await screen.findByRole('table', { name: 'Surtido real frente a demanda' })).toBeTruthy()
  })
})
