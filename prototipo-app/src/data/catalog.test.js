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
    expect(findStore("mcdonald's")?.name).toBe("McDonald's")
    const oxxo = productsOfStore('OXXO')
    expect(oxxo.length).toBeGreaterThan(0)
    oxxo.forEach((product) => expect(product.store).toBe('OXXO'))
  })
})

describe('menús reales (si existe el JSON exportado)', () => {
  test('cada plato real apunta a una tienda del catálogo', async () => {
    const { REAL_DISHES } = await import('./realMenus')
    REAL_DISHES.slice(0, 50).forEach((dish) => {
      expect(findStore(dish.store)).toBeDefined()
      expect(dish.price).toMatch(/^\$\d/)
    })
  })
})

describe('restaurantes reales', () => {
  test('siempre tienen tiempo de entrega (aunque la base lo traiga vacío)', async () => {
    const { REAL_RESTAURANTS } = await import('./realMenus')
    REAL_RESTAURANTS.forEach((restaurant) => expect(restaurant.eta).toBeTruthy())
  })
})

describe('tope de resultados', () => {
  test('una letra suelta no devuelve el catálogo entero', async () => {
    const { MAX_PRODUCT_RESULTS, MAX_STORE_RESULTS } = await import('./catalog')
    const found = search('a')
    expect(found.products.length).toBeLessThanOrEqual(MAX_PRODUCT_RESULTS)
    expect(found.stores.length).toBeLessThanOrEqual(MAX_STORE_RESULTS)
    expect(found.products.length).toBe(MAX_PRODUCT_RESULTS)
  })
})
