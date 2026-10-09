import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { AddressProvider, useAddress } from './AddressContext'
import { FavoritesProvider, useFavorites } from './FavoritesContext'
import { LoyaltyProvider, useLoyalty } from './LoyaltyContext'
import { loadStored, saveStored } from './storage'

afterEach(() => localStorage.clear())

describe('persistencia en el navegador', () => {
  test('favoritos: sobreviven a una recarga, sin el menú real', () => {
    const first = renderHook(() => useFavorites(), { wrapper: FavoritesProvider })
    act(() => first.result.current.toggle({ name: 'Délice', img: 'x.webp', sections: [{ items: [] }] }))
    first.unmount()
    const second = renderHook(() => useFavorites(), { wrapper: FavoritesProvider })
    expect(second.result.current.isFavorite('Délice')).toBe(true)
    expect(second.result.current.stores[0].sections).toBeUndefined()
  })

  test('dirección: se recuerda la elegida; un id desconocido vuelve a la primera', () => {
    const first = renderHook(() => useAddress(), { wrapper: AddressProvider })
    act(() => first.result.current.select('work'))
    first.unmount()
    expect(renderHook(() => useAddress(), { wrapper: AddressProvider }).result.current.selected.id).toBe('work')
    localStorage.setItem('rappi-proto-address', JSON.stringify('otra'))
    expect(renderHook(() => useAddress(), { wrapper: AddressProvider }).result.current.selected.id).toBe('home')
  })

  test('lealtad: el programa vinculado se recuerda', () => {
    const first = renderHook(() => useLoyalty(), { wrapper: LoyaltyProvider })
    act(() => first.result.current.link('iberia'))
    first.unmount()
    expect(renderHook(() => useLoyalty(), { wrapper: LoyaltyProvider }).result.current.activeId).toBe('iberia')
  })

  test('loadStored: JSON roto o forma inválida devuelven el valor por defecto', () => {
    localStorage.setItem('k', '{rota')
    expect(loadStored('k', () => true, 'def')).toBe('def')
    saveStored('k', 5)
    expect(loadStored('k', (v) => typeof v === 'string', 'def')).toBe('def')
    expect(loadStored('k', (v) => typeof v === 'number', 'def')).toBe(5)
  })
})
