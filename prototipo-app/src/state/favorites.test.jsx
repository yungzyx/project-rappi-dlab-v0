import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { FavoritesProvider, useFavorites } from './FavoritesContext'

afterEach(() => localStorage.clear())

const favorites = () => renderHook(() => useFavorites(), { wrapper: FavoritesProvider })

describe('favoritos por tienda', () => {
  test('dos tiendas con el mismo nombre y distinto id se marcan por separado', () => {
    const { result } = favorites()
    const centro = { id: 9101, name: 'Unimarc', vertical: 'grocery' }
    const norte = { id: 9102, name: 'Unimarc', vertical: 'grocery' }

    act(() => result.current.toggle(centro))
    expect(result.current.isFavorite(centro)).toBe(true)
    expect(result.current.isFavorite(norte)).toBe(false)

    act(() => result.current.toggle(norte))
    expect(result.current.stores.map((store) => store.id)).toEqual([9102, 9101])

    act(() => result.current.toggle(centro)) // quitar una no quita la otra
    expect(result.current.isFavorite(centro)).toBe(false)
    expect(result.current.isFavorite(norte)).toBe(true)
  })

  test('los favoritos guardados antes, solo con nombre, se siguen cargando y se reconocen por nombre', () => {
    localStorage.setItem('rappi-proto-favorites', JSON.stringify([{ name: 'Délice', img: 'x.webp' }]))
    const { result } = favorites()
    expect(result.current.stores).toHaveLength(1)
    expect(result.current.isFavorite({ name: 'Délice' })).toBe(true)
    expect(result.current.isFavorite({ id: 9101, name: 'Délice' })).toBe(true) // el nombre es lo único que había

    act(() => result.current.toggle({ name: 'Délice' }))
    expect(result.current.stores).toEqual([])
  })

  test('una tienda con id no se confunde con otra que se llama igual pero ya trae su propio id', () => {
    localStorage.setItem('rappi-proto-favorites', JSON.stringify([{ id: 9101, name: 'Unimarc' }]))
    const { result } = favorites()
    expect(result.current.isFavorite({ id: 9101, name: 'Unimarc' })).toBe(true)
    expect(result.current.isFavorite({ id: 9102, name: 'Unimarc' })).toBe(false)
  })
})
