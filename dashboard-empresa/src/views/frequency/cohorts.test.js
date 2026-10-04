import { describe, expect, test } from 'vitest'
import { buildCohortMatrix, retentionBin } from './cohorts.js'
import saved from '../../fixtures/cohorts.synthetic.json'

const cell = (cohorte, semana, retencion_pct, usuarios = 30) => ({ cohorte, semana, retencion_pct, usuarios })

describe('buildCohortMatrix', () => {
  test('ordena cohortes y arma una columna por semana', () => {
    const rows = [cell('2026-09-07', 0, 100, 10), cell('2026-08-31', 1, 40), cell('2026-08-31', 0, 100)]

    const { weeks, cohorts } = buildCohortMatrix(rows)

    expect(weeks).toEqual([0, 1])
    expect(cohorts.map((row) => row.cohort)).toEqual(['2026-08-31', '2026-09-07'])
    expect(cohorts[0].cells).toEqual([100, 40])
    expect(cohorts[1].small).toBe(true)
  })

  test('una semana ya cumplida sin fila vale 0% y una que no llega queda vacía', () => {
    const rows = [cell('2026-08-03', 0, 100), cell('2026-08-03', 3, 20), cell('2026-09-14', 0, 100)]

    const { cohorts } = buildCohortMatrix(rows)

    expect(cohorts[0].cells).toEqual([100, 0, 0, 20])
    // Cohorte del 14-09: la API no trae la semana 1 (21 al 27-09) porque aún no termina.
    expect(cohorts[1].cells).toEqual([100, null, null, null])
  })

  test('una semana que la API no trae queda vacía aunque ya haya terminado (corte en domingo)', () => {
    // La API corta en la última semana terminada antes de la del corte: con as_of el domingo 27-09 deja fuera
    // la semana del 21 al 27-09. No es 0%: es una semana sin calcular.
    const rows = [cell('2026-08-31', 0, 100), cell('2026-08-31', 1, 29.2), cell('2026-08-31', 2, 33.3)]

    const { cohorts } = buildCohortMatrix([...rows, cell('2026-07-27', 8, 30)])

    expect(cohorts[1].cells.slice(0, 4)).toEqual([100, 29.2, 33.3, null])
  })

  test('con los datos guardados, las semanas que la API no trajo quedan vacías', () => {
    const { cohorts } = buildCohortMatrix(saved.data)

    for (const { cohort, cells } of cohorts) {
      const last = Math.max(...saved.data.filter((row) => row.cohorte === cohort).map((row) => row.semana))
      expect(cells.slice(last + 1), cohort).toEqual(cells.slice(last + 1).map(() => null))
    }
  })

  test('con los datos guardados: una fila por cohorte y sus semanas', () => {
    const { weeks, cohorts } = buildCohortMatrix(saved.data)
    const first = saved.data[0]
    const cohortIds = [...new Set(saved.data.map((row) => row.cohorte))]

    expect(weeks).toHaveLength(Math.max(...saved.data.map((row) => row.semana)) + 1)
    expect(cohorts).toHaveLength(cohortIds.length)
    expect(cohorts[0]).toMatchObject({ cohort: first.cohorte, users: first.usuarios })
    expect(cohorts[0].cells[0]).toBe(100)
  })

  test('sin filas devuelve una matriz vacía', () => {
    expect(buildCohortMatrix([])).toEqual({ weeks: [], cohorts: [] })
  })
})

describe('retentionBin', () => {
  test('tramos de 10 puntos, del 1 al 6', () => {
    expect(retentionBin(0)).toBe(1)
    expect(retentionBin(9.9)).toBe(1)
    expect(retentionBin(10)).toBe(2)
    expect(retentionBin(45)).toBe(5)
    expect(retentionBin(61.5)).toBe(6)
  })
})
