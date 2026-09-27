import { describe, expect, test } from 'vitest'
import { coverageRows, crossVerticalSummary } from './coverage.js'
import saved from '../../fixtures/catalog.json'

describe('coverageRows', () => {
  test('calcula obtenidos / declarados', () => {
    const [row] = coverageRows([{ vertical: 'mall', declarados: 200, obtenidos: 50 }])

    expect(row.coveragePct).toBe(25)
    expect(row.overCount).toBe(false)
  })

  test('marca cuando se obtuvo más de lo declarado y no divide por cero', () => {
    const rows = coverageRows([
      { vertical: 'conveniencia', declarados: 1756, obtenidos: 4482 },
      { vertical: 'farmacia', declarados: 0, obtenidos: 3 },
    ])

    expect(rows[0].overCount).toBe(true)
    expect(rows[1].coveragePct).toBeNull()
    expect(rows[1].overCount).toBe(false)
  })

  test('con los datos guardados, marca justo los verticales con más obtenidos que declarados', () => {
    const flagged = coverageRows(saved.data.cobertura).filter((row) => row.overCount)
    const expected = saved.data.cobertura.filter((row) => row.declarados > 0 && row.obtenidos > row.declarados)

    expect(flagged.map((row) => row.vertical)).toEqual(expected.map((row) => row.vertical))
  })
})

describe('crossVerticalSummary', () => {
  test('suma los productos y ordena por número de verticales', () => {
    const summary = crossVerticalSummary([
      { n_verticales: 3, productos: 595 },
      { n_verticales: 2, productos: 2645 },
    ])

    expect(summary.total).toBe(3240)
    expect(summary.rows.map((row) => row.n_verticales)).toEqual([2, 3])
  })
})
