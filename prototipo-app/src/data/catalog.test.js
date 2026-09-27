import { describe, expect, test } from 'vitest'
import { ALL_STORES, findStore, productsOfStore, search } from './catalog'

describe('search', () => {
  test('ignora tildes y mayúsculas', () => {
    const names = search('botilleria').stores.map((store) => store.name)
    expect(names).toContain('Botillería Y Minimarket Los Molinos')
  })

  test('todas las palabras deben aparecer', () => {
    const products = search('heineken lata').products
    expect(products.length).toBeGreaterThan(0)
    products.forEach((product) => expect(product.name.toLowerCase()).toMatch(/heineken/))
  })

  test('una búsqueda vacía no devuelve nada', () => {
    expect(search('   ')).toEqual({ stores: [], products: [] })
  })
})

describe('catálogo', () => {
  test('no repite tiendas con el mismo nombre', () => {
    const names = ALL_STORES.map((store) => store.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
  })

  test('findStore encuentra sin tildes y productsOfStore filtra por tienda', () => {
    expect(findStore('mcdonald\'s')?.name).toBe("McDonald's")
    const oxxo = productsOfStore('OXXO')
    expect(oxxo.length).toBeGreaterThan(0)
    oxxo.forEach((product) => expect(product.store).toBe('OXXO'))
  })
})
