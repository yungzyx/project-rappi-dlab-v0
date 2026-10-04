import { describe, expect, test } from 'vitest'
import { productTags, productsForTags, tagsOf, topDiscounts, variedDiscounts } from './tags'

describe('tagsOf', () => {
  test('reconoce temas sin importar tildes, ñ ni mayúsculas', () => {
    expect(tagsOf('Pañales Pampers')).toContain('bebe')
    expect(tagsOf('CERVEZA Heineken')).toContain('cerveza')
    expect(tagsOf('Chocolate con almendras')).toContain('dulce')
  })

  test('acepta plurales y derivados que empiezan con la palabra clave', () => {
    expect(tagsOf('Hamburguesas')).toContain('hamburguesa')
    expect(tagsOf('Papa Johns Pizza')).toContain('pizza')
    expect(tagsOf('Mascotas felices')).toContain('mascota')
  })

  test('no confunde palabras que contienen la clave en el medio', () => {
    expect(tagsOf('Carpeta escolar')).not.toContain('mascota')
    expect(tagsOf('Crédito')).not.toContain('belleza')
  })

  test('sin temas conocidos devuelve una lista vacía', () => {
    expect(tagsOf('zzz')).toEqual([])
    expect(tagsOf('')).toEqual([])
    expect(tagsOf(undefined)).toEqual([])
  })
})

describe('productsForTags', () => {
  test('devuelve productos del tema pedido', () => {
    const beers = productsForTags(['cerveza'])
    expect(beers.length).toBeGreaterThan(0)
    beers.forEach((product) => expect(tagsOf(`${product.name} ${product.store}`)).toContain('cerveza'))
  })

  test('nunca ofrece productos con la foto cortada', () => {
    const all = productsForTags(Object.keys({ cerveza: 1, dulce: 1, belleza: 1, farmacia: 1, snack: 1 }), 100)
    expect(all.some((product) => product.partial)).toBe(false)
  })

  test('respeta el límite', () => {
    expect(productsForTags(['cerveza'], 2)).toHaveLength(2)
  })
})

describe('topDiscounts', () => {
  test('ordena de mayor a menor descuento y excluye productos cortados', () => {
    const top = topDiscounts(5)
    const pct = top.map((product) => Math.abs(parseInt(product.discount, 10)) || 0)
    expect(pct).toEqual([...pct].sort((a, b) => b - a))
    expect(top.some((product) => product.partial)).toBe(false)
  })
})

describe('variedDiscounts', () => {
  test('primero la mejor oferta de cada vertical, después el resto', () => {
    const picks = variedDiscounts(6)
    const verticals = picks.map((product) => product.vertical)
    expect(new Set(verticals).size).toBe(verticals.length)
    expect(picks.some((product) => product.partial)).toBe(false)
  })
})

describe('temas por nombre', () => {
  test('la tienda no contamina los temas del producto', () => {
    expect(productTags({ name: 'Cerveza Heineken 470', store: 'Botilleria Tag' })).toEqual(['cerveza'])
    expect(productTags({ name: 'Combo del día', store: 'KFC' })).toEqual(['pollo'])
  })
})
