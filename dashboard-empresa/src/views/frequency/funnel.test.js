import { describe, expect, test } from 'vitest'
import { funnelRows } from './funnel.js'

describe('funnelRows', () => {
  test('calcula el % sobre las que buscan y la conversión de cada paso', () => {
    const [row] = funnelRows([{ vertical: 'restaurantes', buscan: 200, agregan: 150, pagan: 120, piden: 114 }])

    expect(row.stages.map((stage) => stage.shareOfTop)).toEqual([100, 75, 60, 57])
    expect(row.stages.map((stage) => stage.stepPct)).toEqual([null, 75, 80, 95])
    expect(row.overallPct).toBe(57)
  })

  test('marca el paso con la mayor pérdida', () => {
    const [row] = funnelRows([{ vertical: 'licores', buscan: 100, agregan: 100, pagan: 67, piden: 67 }])

    expect(row.worstStep).toEqual({ from: 'del carro', to: 'al pago', stepPct: 67 })
  })

  test('sin pérdidas no hay paso peor', () => {
    const [row] = funnelRows([{ vertical: 'mall', buscan: 5, agregan: 5, pagan: 5, piden: 5 }])

    expect(row.worstStep).toBeNull()
  })

  test('sin sesiones que buscan no divide por cero (datos del prototipo)', () => {
    const [row] = funnelRows([{ vertical: 'licores', buscan: 0, agregan: 0, pagan: 0, piden: 0 }])

    expect(row.overallPct).toBeNull()
    expect(row.stages.every((stage) => stage.shareOfTop === null)).toBe(true)
    expect(row.stages[1].stepPct).toBeNull()
  })

  test('una etapa que se corta en cero cuenta como pérdida total', () => {
    const [row] = funnelRows([{ vertical: 'licores', buscan: 1, agregan: 0, pagan: 0, piden: 0 }])

    expect(row.stages[1].stepPct).toBe(0)
    expect(row.stages[2].stepPct).toBeNull()
    expect(row.worstStep).toMatchObject({ from: 'de la búsqueda', to: 'al carro' })
  })
})
