import { afterEach, describe, expect, test } from 'vitest'
import { COMPLEMENTS, TAGS } from './tags'
import { discoveries } from './discover'
import { EXPLORABLE, exploredVerticals, markExplored } from './explored'

afterEach(() => sessionStorage.clear())

describe('discoveries', () => {
  test('sin perfil igual invita: tarjetas de verticales distintas, con 2 o 3 ítems cada una', () => {
    const cards = discoveries([])
    expect(cards.length).toBeGreaterThan(0)
    expect(new Set(cards.map((card) => card.vertical)).size).toBe(cards.length)
    for (const card of cards) {
      expect(card.from).toBeNull() // no dice «te gusta» si todavía no sabe nada
      expect(card.items.length).toBeGreaterThanOrEqual(2)
      expect(card.items.length).toBeLessThanOrEqual(3)
      expect(card.items.every((item) => item.vertical === card.vertical)).toBe(true)
    }
  })

  test('con perfil, parte de lo que le gusta y sugiere su complemento', () => {
    const [card] = discoveries(['cerveza'])
    expect(card.from.tag).toBe('cerveza')
    expect(COMPLEMENTS.cerveza).toContain(card.to.tag)
  })

  test('no repite verticales que la persona ya abrió', () => {
    const first = discoveries(['cerveza'])
    const opened = first.map((card) => card.vertical)
    const again = discoveries(['cerveza'], opened)
    expect(again.some((card) => opened.includes(card.vertical))).toBe(false)
  })

  test('la salud y la guagua no se sugieren', () => {
    const cards = discoveries(['farmacia', 'bebe'])
    expect(cards.some((card) => ['farmacia', 'bebe'].includes(card.to.tag) || card.from)).toBe(false)
    expect(cards.some((card) => card.vertical === 'pharmacy')).toBe(false)
  })
})

describe('verticales exploradas', () => {
  test('se anotan una vez y solo si existen', () => {
    markExplored('liquor')
    markExplored('liquor')
    markExplored('no-existe')
    expect(exploredVerticals()).toEqual(['liquor'])
    expect(EXPLORABLE).toContain('liquor')
  })

  test('un valor dañado en el almacenamiento no rompe nada', () => {
    sessionStorage.setItem('rappi-explored', '{roto')
    expect(exploredVerticals()).toEqual([])
  })
})

describe('restaurantes', () => {
  test('solo se sugieren para comida preparada', () => {
    const cards = [...discoveries([]), ...discoveries(['cerveza']), ...discoveries(['dulce'])]
    const prepared = ['pizza', 'hamburguesa', 'pollo', 'sushi']
    expect(
      cards.filter((card) => card.vertical === 'restaurants').every((card) => prepared.includes(card.to.tag)),
    ).toBe(true)
  })
})

describe('Mascotas', () => {
  test('no es una vertical que se explore ni se sugiera: ya no está en la app', () => {
    expect(EXPLORABLE).not.toContain('pet')
    markExplored('pet')
    expect(exploredVerticals()).toEqual([])

    const sources = [[], ...Object.keys(TAGS).map((tag) => [tag])]
    for (const top of sources) {
      for (const card of discoveries(top)) {
        expect(card.vertical, `tarjeta de ${top.join()}`).not.toBe('pet')
        expect(EXPLORABLE).toContain(card.vertical)
      }
    }
  })
})
