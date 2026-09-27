import { describe, expect, test } from 'vitest'
import { buildCohortMatrix, retentionBin } from './cohorts.js'
import saved from '../../fixtures/cohorts.synthetic.json'

const cell = (cohorte, semana, retencion_pct, usuarios = 30) => ({ cohorte, semana, retencion_pct, usuarios })

describe('buildCohortMatrix', () => {
  test('ordena cohortes y arma una columna por semana', () => {
    const rows = [cell('2026-09-07', 0, 100, 10), cell('2026-08-31', 1, 40), cell('2026-08-31', 0, 100)]

    const { weeks, cohorts } = buildCohortMatrix(rows, '2026-09-10')

    expect(weeks).toEqual([0, 1])
    expect(cohorts.map((row) => row.cohort)).toEqual(['2026-08-31', '2026-09-07'])
    expect(cohorts[0].cells).toEqual([100, 40])
    expect(cohorts[1].small).toBe(true)
  })

  test('una semana ya cumplida sin fila vale 0% y una que no llega queda vacía', () => {
    const rows = [cell('2026-08-03', 0, 100), cell('2026-08-03', 3, 20), cell('2026-09-14', 0, 100)]

    const { cohorts } = buildCohortMatrix(rows, '2026-09-26T23:58:56-03:00')

    expect(cohorts[0].cells).toEqual([100, 0, 0, 20])
    // Cohorte del 14-09: la semana 1 (21 al 27-09) aún no termina al 26-09.
    expect(cohorts[1].cells).toEqual([100, null, null, null])
  })

  test('con los datos guardados: una fila por cohorte y sus semanas', () => {
    const { weeks, cohorts } = buildCohortMatrix(saved.data, '2026-09-26')
    const first = saved.data[0]
    const cohortIds = [...new Set(saved.data.map((row) => row.cohorte))]

    expect(weeks).toHaveLength(Math.max(...saved.data.map((row) => row.semana)) + 1)
    expect(cohorts).toHaveLength(cohortIds.length)
    expect(cohorts[0]).toMatchObject({ cohort: first.cohorte, users: first.usuarios })
    expect(cohorts[0].cells[0]).toBe(100)
  })

  test('sin filas devuelve una matriz vacía', () => {
    expect(buildCohortMatrix([], null)).toEqual({ weeks: [], cohorts: [] })
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
