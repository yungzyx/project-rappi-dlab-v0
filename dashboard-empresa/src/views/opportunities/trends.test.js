import { describe, expect, test } from 'vitest'
import { splitTrends } from './trends.js'
import saved from '../../fixtures/trends.synthetic.json'

const row = (concept_id, crecimiento_pct) => ({ concept_id, concepto: concept_id, crecimiento_pct })

describe('splitTrends', () => {
  test('separa y ordena del cambio más fuerte al más débil', () => {
    const { rising, falling, max } = splitTrends([row('a', 10), row('b', -40), row('c', 35), row('d', -5)])

    expect(rising.map((r) => r.concept_id)).toEqual(['c', 'a'])
    expect(falling.map((r) => r.concept_id)).toEqual(['b', 'd'])
    expect(max).toBe(40)
  })

  test('descarta cambios nulos o cero', () => {
    const { rising, falling } = splitTrends([row('a', null), row('b', 0)])

    expect(rising).toEqual([])
    expect(falling).toEqual([])
  })

  test('con los datos guardados: peruana sube primero y dermocosmética baja primero', () => {
    const { rising, falling } = splitTrends(saved.data)

    expect(rising[0].concept_id).toBe('peruana')
    expect(falling[0].concept_id).toBe('dermocosmetica')
    expect(rising.length + falling.length).toBe(saved.data.length)
  })
})
