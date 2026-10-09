import { describe, expect, test } from 'vitest'
import { DATA, formatNumber } from './data.js'
import { FACTS, factsOf } from './facts.js'

const fact = (id) => FACTS.find((f) => f.id === id)

describe('cartas «¿Sabías que…?»', () => {
  test('hay entre 40 y 50, con ids únicos', () => {
    expect(FACTS.length).toBeGreaterThanOrEqual(40)
    expect(FACTS.length).toBeLessThanOrEqual(50)
    expect(new Set(FACTS.map((f) => f.id)).size).toBe(FACTS.length)
  })

  test('cada vertical tiene cartas y las generales no tienen vertical', () => {
    for (const v of DATA.order) expect(factsOf(v).length).toBeGreaterThanOrEqual(3)
    expect(FACTS.filter((f) => f.vertical === null).map((f) => f.id)).toEqual([
      'general-una-vertical',
      'general-catalogo',
    ])
  })

  test('los productos de cada vertical coinciden con los datos', () => {
    for (const v of DATA.order) {
      expect(fact(`${v}-productos`).text).toContain(formatNumber(DATA.products[v]))
    }
    expect(fact('restaurantes-productos').text).toContain('platos')
  })

  test('lo que más hay es el concepto con más productos en la vertical', () => {
    for (const v of DATA.order) {
      const top = DATA.concepts
        .filter((c) => (c.items[v] ?? 0) >= DATA.minItems)
        .sort((a, b) => b.items[v] - a.items[v] || a.id.localeCompare(b.id))[0]
      expect(fact(`${v}-mas`).text).toContain(top.name)
      expect(fact(`${v}-mas`).text).toContain(formatNumber(top.items[v]))
    }
  })

  test('la vecina es la vertical con la que comparte más productos', () => {
    for (const v of DATA.order) {
      const pairs = DATA.shared.filter(([a, b]) => a === v || b === v)
      if (!pairs.length) {
        expect(fact(`${v}-comparte`)).toBeUndefined()
        continue
      }
      const [a, b, n] = pairs.reduce((best, p) => (p[2] > best[2] ? p : best))
      const other = a === v ? b : a
      expect(fact(`${v}-comparte`).text).toContain(formatNumber(n))
      expect(fact(`${v}-comparte`).text).toContain(DATA.labels[other])
    }
  })

  // Cada vertical toma la primera fila que la incluye y que otra vertical anterior no usó (si no queda, la primera).
  const pick = (rows) => {
    const used = new Set()
    return Object.fromEntries(
      DATA.order.map((v) => {
        const rows_ = rows.filter(([, vs]) => vs.includes(v))
        const row = rows_.find(([name]) => !used.has(name)) ?? rows_[0]
        if (row) used.add(row[0])
        return [v, row]
      }),
    )
  }

  test('producto puente y cadena no se repiten entre verticales mientras haya otras filas', () => {
    const bridges = pick(DATA.bridges)
    const chains = pick(DATA.chains)
    for (const v of DATA.order) {
      const bridge = bridges[v]
      const chain = chains[v]
      if (bridge) {
        expect(fact(`${v}-puente`).text).toContain(bridge[0])
        expect(fact(`${v}-puente`).text).toContain(`${bridge[1].length} de las 8`)
        expect(fact(`${v}-puente`).text).toContain(formatNumber(bridge[2]))
      } else expect(fact(`${v}-puente`)).toBeUndefined()
      if (chain) {
        expect(fact(`${v}-cadena`).text).toContain(chain[0])
        expect(fact(`${v}-cadena`).text).toContain(`${chain[1].length} verticales`)
      } else expect(fact(`${v}-cadena`)).toBeUndefined()
    }
    const names = FACTS.filter((f) => f.id.endsWith('-puente')).map((f) => f.text.split(' se vende')[0])
    expect(new Set(names).size).toBe(names.length)
  })

  test('las generales usan el reparto y el total del catálogo', () => {
    const total = DATA.spread.reduce((s, [, n]) => s + n, 0)
    const one = DATA.spread.find(([k]) => k === 1)[1]
    expect(fact('general-una-vertical').text).toContain(`${Math.round((one / total) * 100)} de cada 100`)
    expect(fact('general-una-vertical').text).toMatch(/están en \d+ verticales\.$/)
    expect(fact('general-catalogo').text).toContain(formatNumber(DATA.catalogTotal))
  })

  test('ninguna carta invita a comprar', () => {
    for (const f of FACTS) expect(f.text).not.toMatch(/compra|pide|agrega al carro/i)
  })
})
