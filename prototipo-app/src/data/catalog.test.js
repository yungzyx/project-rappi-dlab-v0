import { describe, expect, test, vi } from 'vitest'
import { ALL_PRODUCTS, ALL_STORES, MAX_PRODUCT_RESULTS, MAX_STORE_RESULTS, findStore, search, storeFor } from './catalog'

// El índice se prueba con un catálogo mínimo inventado: así no depende de lo que traigan las capturas transcritas
// (que se van en la etapa 3), solo de lo que hace catalog.js con ellas.
vi.mock('./transcribedCatalog', () => ({
  TURBO_RESTAURANTS: [{ id: 'r-mcd', name: "McDonald's", eta: '20 min' }],
  LOWER_FEES: [{ id: 'r-mcd-2', name: "MCDONALD'S", eta: '25 min' }],
  MOST_ORDERED: [{ id: 'r-cafe', name: 'Café del Ñandú', eta: '30 min' }],
  NEW_IN_RAPPI: [
    { id: 'r-nuevo', name: 'Sushi Nuevo', eta: '35 min' },
    { id: 'r-cortado', name: 'Local Cortado', eta: '35 min', partial: true },
  ],
  BEST_RESTAURANTS: [{ id: 'r-pizza', name: 'Pizzería Roma', eta: '40 min', vertical: 'restaurants' }],
  BEST_GROCERY: [{ id: 'g-molinos', name: 'Botillería Los Molinos', vertical: 'liquor' }],
  NEARBY_STORES: [
    { id: 'n-pan', name: 'Panadería Cercana', when: 'Sun, 9 AM', scheduled: true },
    { id: 'n-feria', name: 'Feria Cercana', when: '15 min' },
  ],
  CRAZY_DEALS: [{ id: 'd-combo', name: 'Combo Familiar', store: "McDonald's", vertical: 'restaurants', price: '$9.990' }],
  TOP_PIZZAS: [{ id: 'p-peperoni', name: 'Pizza Peperoni', store: 'Pizzería Roma', price: '$7.990' }],
  GROCERY_SECTIONS: [
    { id: 's1', products: [{ id: 'g-heineken', name: 'Heineken Lata 350 mL', store: 'Botillería Los Molinos', price: '$1.290' }] },
    // Para el tope: más productos con «galleta» que MAX_PRODUCT_RESULTS.
    {
      id: 's2',
      products: Array.from({ length: 40 }, (_, i) => ({ id: `g-galleta-${i}`, name: `Galleta ${i}`, store: 'Kiosco', price: '$500' })),
    },
  ],
}))

vi.mock('./verticalCatalog', () => ({
  VERTICAL_PRODUCTS: [{ id: 'v-oxxo-agua', name: 'Agua con Gas', store: 'OXXO', vertical: 'express', price: '$900' }],
  // Más tiendas con «local» que MAX_STORE_RESULTS.
  VERTICAL_STORES: Array.from({ length: 15 }, (_, i) => ({ id: `v-local-${i}`, name: `Local ${i}`, vertical: 'express' })),
}))

describe('search', () => {
  test('ignora tildes y mayúsculas', () => {
    expect(search('BOTILLERIA').stores.map((store) => store.name)).toContain('Botillería Los Molinos')
    expect(search('cafe nandu').stores.map((store) => store.name)).toContain('Café del Ñandú')
  })

  test('todas las palabras deben aparecer, en el nombre o en la tienda del producto', () => {
    expect(search('heineken lata').products.map((product) => product.id)).toEqual(['g-heineken'])
    expect(search('heineken lager').products).toEqual([])
    expect(search('pizza roma').products.map((product) => product.id)).toEqual(['p-peperoni'])
  })

  test('una búsqueda vacía no devuelve nada', () => {
    expect(search('   ')).toEqual({ stores: [], products: [] })
  })

  test('una letra suelta no devuelve el catálogo entero', () => {
    const found = search('a')
    expect(found.products).toHaveLength(MAX_PRODUCT_RESULTS)
    expect(found.stores).toHaveLength(MAX_STORE_RESULTS)
    expect(search('galleta 39').products.map((product) => product.id)).toEqual(['g-galleta-39']) // el tope no tapa una búsqueda precisa
  })
})

describe('catálogo', () => {
  test('no repite tiendas con el mismo nombre y deja la primera', () => {
    const names = ALL_STORES.map((store) => store.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
    expect(findStore("mcdonald's")).toMatchObject({ id: 'r-mcd', eta: '20 min' })
  })

  test('los restaurantes de las capturas llevan la vertical restaurantes, sin los de foto cortada', () => {
    expect(findStore('Sushi Nuevo')?.vertical).toBe('restaurants')
    expect(findStore('Café del Ñandú')?.vertical).toBe('restaurants')
    expect(findStore('Local Cortado')).toBeUndefined()
    expect(findStore('Botillería Los Molinos')?.vertical).toBe('liquor')
  })

  test('las tiendas cercanas muestran su horario como tiempo de entrega', () => {
    expect(findStore('Panadería Cercana')).toMatchObject({ eta: 'Sun, 9 AM', etaIcon: 'clock', logo: true })
    expect(findStore('Feria Cercana')).toMatchObject({ eta: '15 min', etaIcon: 'bolt', logo: true })
  })

  test('los productos juntan los de ofertas, pizzas, pasillos y verticales', () => {
    const ids = ALL_PRODUCTS.map((product) => product.id)
    expect(ids).toEqual(expect.arrayContaining(['d-combo', 'p-peperoni', 'g-heineken', 'g-galleta-39', 'v-oxxo-agua']))
  })

  test('findStore y storeFor encuentran por nombre, sin tildes ni mayúsculas', () => {
    expect(findStore('panaderia CERCANA')?.id).toBe('n-pan')
    expect(storeFor({ name: 'pizzeria roma' })?.id).toBe('r-pizza')
    expect(storeFor({ name: 'No existe' })).toBeUndefined()
  })
})
