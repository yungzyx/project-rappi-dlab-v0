import { describe, expect, it } from 'vitest'
import { PLANS, discoveryFor, planKit } from './script'

describe('discoveryFor', () => {
  it('propone otra vertical distinta de la de lo agregado', () => {
    const interest = { tag: 'dulce', vertical: 'chocolates' }
    const discovery = discoveryFor(interest)
    expect(discovery.items.length).toBeGreaterThanOrEqual(2)
    expect(discovery.vertical).not.toBe(interest.vertical)
    expect(discovery.items.every((item) => item.vertical === discovery.vertical)).toBe(true)
    expect(discovery.verticalName).toBeTruthy()
  })

  it('no combina nada con lo de salud (un remedio agregado al carro no abre otra vertical)', () => {
    expect(discoveryFor({ tag: 'farmacia', vertical: 'pharmacy' })).toBeNull()
    expect(discoveryFor({ tag: 'bebe', vertical: 'grocery' })).toBeNull()
  })
})

describe('planKit', () => {
  it('arma un kit de varias verticales para cada plan', () => {
    for (const plan of PLANS) {
      const kit = planKit(plan.id)
      expect(kit.length).toBeGreaterThan(1)
      expect(kit.length).toBeLessThanOrEqual(4)
      expect(new Set(kit.map((item) => item.key)).size).toBe(kit.length)
    }
    expect(new Set(planKit('carrete').map((item) => item.vertical)).size).toBeGreaterThan(1)
  })
})
