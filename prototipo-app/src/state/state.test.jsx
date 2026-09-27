import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { CartProvider, formatPrice, parsePrice, useCart } from './CartContext'
import { ProfileProvider, WEIGHTS, useProfile } from './ProfileContext'

const BEER = { id: 'beer', name: 'Cerveza Heineken', price: '$6.690' }
const CHIPS = { id: 'chips', name: 'Papas fritas', price: '$2.690' }

describe('precios', () => {
  test('parsePrice y formatPrice usan el formato chileno', () => {
    expect(parsePrice('$10.990')).toBe(10990)
    expect(parsePrice(undefined)).toBe(0)
    expect(formatPrice(10990)).toBe('$10.990')
  })
})

describe('CartContext', () => {
  const setup = () => renderHook(() => useCart(), { wrapper: CartProvider })

  test('suma cantidades y total', () => {
    const { result } = setup()
    act(() => result.current.add(BEER))
    act(() => result.current.add(BEER))
    act(() => result.current.add(CHIPS))
    expect(result.current.qtyOf(BEER)).toBe(2)
    expect(result.current.count).toBe(3)
    expect(result.current.total).toBe(6690 * 2 + 2690)
  })

  test('quitar la última unidad saca el producto; vaciar deja el carrito en cero', () => {
    const { result } = setup()
    act(() => result.current.add(BEER))
    act(() => result.current.remove(BEER))
    expect(result.current.items).toEqual([])
    act(() => result.current.add(CHIPS))
    act(() => result.current.clear())
    expect(result.current.count).toBe(0)
  })

  // Productos de la API: el mismo "cat-<id>" del catálogo se vende en varias tiendas y verticales.
  const OFFER_A = { id: 'cat-200', name: 'Cerveza Escudo', price: '$1.290', vertical: 'licores', store: 'Botillería' }
  const OFFER_B = { ...OFFER_A, price: '$1.390', vertical: 'supermercado', store: 'Unimarc' }

  test('cada oferta es su propia línea (mismo producto en otra tienda o vertical)', () => {
    const { result } = setup()
    act(() => result.current.add(OFFER_A))
    act(() => result.current.add(OFFER_B))
    act(() => result.current.add(OFFER_A))
    expect(result.current.items).toHaveLength(2)
    expect(result.current.qtyOf(OFFER_A)).toBe(2)
    expect(result.current.qtyOf(OFFER_B)).toBe(1)
    expect(result.current.total).toBe(1290 * 2 + 1390)
    act(() => result.current.remove(OFFER_B))
    expect(result.current.items.map((line) => line.product.store)).toEqual(['Botillería'])
  })

  test('la línea recuerda que vino de una sugerencia aunque después se sume desde otra tarjeta', () => {
    const { result } = setup()
    act(() => result.current.add({ ...OFFER_A, fromSuggestion: true }))
    act(() => result.current.add(OFFER_A))
    act(() => result.current.add(OFFER_B))
    const lineOf = (offer) => result.current.items.find((line) => line.product.store === offer.store)
    expect(lineOf(OFFER_A).fromSuggestion).toBe(true)
    expect(lineOf(OFFER_B).fromSuggestion).toBe(false)
  })
})

describe('ProfileContext', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  const setup = () => renderHook(() => useProfile(), { wrapper: ProfileProvider })

  test('ordena los temas por puntaje y los guarda', () => {
    const { result } = setup()
    act(() => result.current.track('Papas fritas', WEIGHTS.query))
    act(() => result.current.track('Cerveza Heineken', WEIGHTS.cart))
    expect(result.current.top).toEqual(['cerveza', 'snack'])
    expect(JSON.parse(localStorage.getItem('rappi-proto-profile'))).toEqual({ snack: 1, cerveza: 3 })
  })

  test('trackTags suma temas directos; texto sin temas no cambia nada', () => {
    const { result } = setup()
    act(() => result.current.trackTags(['carne', 'fresco'], 2))
    act(() => result.current.track('zzz', 5))
    expect(result.current.scores).toEqual({ carne: 2, fresco: 2 })
  })

  test('reset borra lo aprendido', () => {
    const { result } = setup()
    act(() => result.current.track('Cerveza', 1))
    act(() => result.current.reset())
    expect(result.current.top).toEqual([])
  })

  test('sigue funcionando si el navegador bloquea localStorage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    const { result } = setup()
    act(() => result.current.track('Cerveza', 1))
    expect(result.current.top).toEqual(['cerveza'])
  })
})
