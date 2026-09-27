import { describe, expect, test } from 'vitest'
import { barPath, columnPath, niceStep, niceTicks, scaleLinear } from './geometry.js'

describe('niceTicks', () => {
  test('redondea el máximo hacia un paso limpio', () => {
    expect(niceTicks(885)).toEqual([0, 250, 500, 750, 1000])
    expect(niceTicks(16.1)).toEqual([0, 5, 10, 15, 20])
    expect(niceTicks(100)).toEqual([0, 25, 50, 75, 100])
  })

  test('sin datos deja un eje mínimo', () => {
    expect(niceTicks(0)).toEqual([0, 1])
  })

  test('niceStep usa 1, 2, 2,5 o 5 por potencia de 10', () => {
    expect(niceStep(3.2)).toBe(5)
    expect(niceStep(0.13)).toBe(0.2)
    expect(niceStep(220)).toBe(250)
  })
})

describe('scaleLinear', () => {
  test('interpola y admite rangos invertidos', () => {
    const y = scaleLinear([0, 100], [200, 0])
    expect(y(0)).toBe(200)
    expect(y(25)).toBe(150)
    expect(scaleLinear([5, 5], [0, 10])(5)).toBe(0)
  })
})

describe('formas', () => {
  test('barPath cierra en la base y omite barras de ancho cero', () => {
    expect(barPath(0, 100, 0, 12)).toMatch(/^M0,0H96Q100,0 100,4V8Q100,12 96,12H0Z$/)
    expect(barPath(50, 20, 0, 12)).toMatch(/^M50,0H24Q20,0 20,4/)
    expect(barPath(10, 10, 0, 12)).toBe('')
  })

  test('columnPath redondea solo el extremo superior', () => {
    expect(columnPath(0, 20, 100, 40)).toBe('M0,100V44Q0,40 4,40H16Q20,40 20,44V100Z')
    expect(columnPath(0, 20, 100, 100)).toBe('')
  })
})
