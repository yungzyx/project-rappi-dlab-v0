import { describe, expect, test } from 'vitest'
import { DATA, belongs, conceptById, conceptsOf, formatNumber, related } from './data.js'

// Los 6 conceptos sensibles del 04 (catálogo del 05-10-2026), escritos a mano a propósito.
const SENSITIVE = ['accesorios-fumador', 'bienestar-sexual', 'cigarrillos', 'medicamentos', 'salud-sexual', 'vapeo']

describe('datos del mapa', () => {
  test('trae lo esperado del catálogo del 05-10-2026', () => {
    expect(DATA.asOf).toBe('05-10-2026')
    expect(DATA.concepts).toHaveLength(107)
    expect(DATA.complements).toHaveLength(100)
    expect(DATA.substitutes).toHaveLength(20)
    expect(DATA.conflicts).toHaveLength(44)
    expect(DATA.order).toHaveLength(8)
  })

  test('no contiene conceptos sensibles en ninguna parte', () => {
    const text = JSON.stringify(DATA)
    for (const id of SENSITIVE) expect(text).not.toContain(`"${id}"`)
    expect(DATA.concepts.some((c) => 'sensitive' in c)).toBe(false)
    expect(DATA.bridges.some(([name]) => /preservativo/i.test(name))).toBe(false)
  })

  test('cada vertical tiene conceptos según la regla de 20 productos', () => {
    expect(conceptsOf('chocolateria')).toHaveLength(9)
    expect(conceptsOf('supermercado')).toHaveLength(92)
    for (const v of DATA.order) expect(conceptsOf(v).length).toBeGreaterThan(0)
    const choco = conceptsOf('chocolateria')
    for (let i = 1; i < choco.length; i++) {
      expect(choco[i - 1].items.chocolateria).toBeGreaterThanOrEqual(choco[i].items.chocolateria)
    }
  })

  test('belongs exige al menos minItems productos', () => {
    const agua = conceptById('agua')
    expect(agua.name).toBeTruthy()
    for (const v of DATA.order) expect(belongs(agua, v)).toBe((agua.items[v] ?? 0) >= 20)
  })

  test('related une complementos en ambos sentidos y es simétrico en sustitutos y conflictos', () => {
    const [from, to] = DATA.complements[0]
    expect(related(from).complements.has(to)).toBe(true)
    expect(related(to).complements.has(from)).toBe(true)
    for (const [a, b] of DATA.substitutes) {
      expect(related(a).substitutes.has(b)).toBe(true)
      expect(related(b).substitutes.has(a)).toBe(true)
    }
    for (const [a, b] of DATA.conflicts) {
      expect(related(a).conflicts.has(b)).toBe(true)
      expect(related(b).conflicts.has(a)).toBe(true)
    }
  })

  test('formatNumber usa el punto de miles de Chile', () => {
    expect(formatNumber(38454)).toBe('38.454')
    expect(formatNumber(20)).toBe('20')
  })
})
