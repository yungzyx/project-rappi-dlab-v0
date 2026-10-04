import { describe, expect, test } from 'vitest'
import { strataRows } from './strata.js'
import saved from '../../fixtures/multi-vertical.synthetic.json'

const row = (estrato, grupo, retencion_pct, usuarios = 40) => ({ estrato, grupo, retencion_pct, usuarios })

describe('strataRows', () => {
  test('compara dentro de cada estrato y calcula la diferencia en puntos', () => {
    const rows = strataRows([row('3–5 compras', 'multi-vertical', 70), row('3–5 compras', 'un vertical', 55)])

    const middle = rows.find((item) => item.stratum === '3–5 compras')
    expect(middle.groups.map((group) => group?.retencion_pct)).toEqual([70, 55])
    expect(middle.gap).toBe(15)
  })

  test('siempre devuelve los tres estratos, con null donde falta un grupo', () => {
    const rows = strataRows([row('6+ compras', 'multi-vertical', 90)])

    expect(rows.map((item) => item.stratum)).toEqual(['1–2 compras', '3–5 compras', '6+ compras'])
    expect(rows[0].groups).toEqual([null, null])
    expect(rows[2].groups[1]).toBeNull()
    expect(rows[2].gap).toBeNull()
  })

  test('con los datos guardados, los estratos con los dos grupos se comparan', () => {
    // El simulado tiene personas de una sola vertical (antes ningún estrato tenía contra qué comparar).
    const rows = strataRows(saved.data)
    const both = rows.filter((item) => item.groups.every(Boolean))

    expect(both.length).toBeGreaterThan(0)
    for (const item of both) {
      const [multi, single] = item.groups
      expect(item.gap).toBeCloseTo(multi.retencion_pct - single.retencion_pct, 5)
    }
  })
})
