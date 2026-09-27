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
    expect(result.current.qtyOf('beer')).toBe(2)
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
