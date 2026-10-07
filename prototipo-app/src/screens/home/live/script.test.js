import { describe, expect, it } from 'vitest'
import { PLANS, discoveryFor, interestFor, moveToFront, planKit } from './script'

describe('interestFor', () => {
  it('usa lo que más le interesa a la persona', () => {
    expect(interestFor(['cerveza', 'snack']).tag).toBe('cerveza')
  })

  it('sin perfil, parte por los chocolates (la demo)', () => {
    const interest = interestFor([])
    expect(interest.tag).toBe('dulce')
    expect(interest.items.length).toBeGreaterThanOrEqual(3)
    expect(interest.vertical).toBe('chocolates') // las chocolaterías pesan más que un producto suelto
  })

  it('salta los temas sensibles: la salud y la guagua no se sugieren', () => {
    expect(interestFor(['farmacia', 'vino']).tag).toBe('vino')
  })
})

describe('discoveryFor', () => {
  it('propone otra vertical distinta de la del interés', () => {
    const interest = interestFor([])
    const discovery = discoveryFor(interest)
    expect(discovery.items.length).toBeGreaterThanOrEqual(2)
    expect(discovery.vertical).not.toBe(interest.vertical)
    expect(discovery.items.every((item) => item.vertical === discovery.vertical)).toBe(true)
    expect(discovery.verticalName).toBeTruthy()
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

describe('moveToFront', () => {
  it('sube el bloque al primer lugar y deja el nuevo justo debajo', () => {
    expect(moveToFront(['promos', 'turbo', 'interest', 'lower'], 'interest', 'discovery')).toEqual([
      'interest',
      'discovery',
      'promos',
      'turbo',
      'lower',
    ])
  })

  it('no duplica el bloque nuevo si ya estaba', () => {
    expect(moveToFront(['discovery', 'promos', 'interest'], 'interest', 'discovery')).toEqual([
      'interest',
      'discovery',
      'promos',
    ])
  })
})
