import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import { useNavigation } from './useNavigation'

const names = (result) => result.current.stack.map((entry) => entry.name)

describe('useNavigation', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'))

  test('push agrega pantalla, entrada de historial y ruta legible', () => {
    const { result } = renderHook(() => useNavigation())
    const before = window.history.length
    act(() => result.current.push('vertical', { id: 'pet' }))
    expect(names(result)).toEqual(['home', 'vertical'])
    expect(window.history.length).toBe(before + 1)
    expect(window.location.hash).toBe('#/vertical')
    expect(window.history.state.nav.stack[1].params).toEqual({ id: 'pet' })
  })

  test('replace no crea entrada de historial pero sí apila la pantalla', () => {
    const { result } = renderHook(() => useNavigation())
    const before = window.history.length
    act(() => result.current.push('store', {}, { replace: true }))
    expect(names(result)).toEqual(['home', 'store'])
    expect(window.history.length).toBe(before)
  })

  test('swap cambia la pantalla actual por otra (checkout → seguimiento)', () => {
    const { result } = renderHook(() => useNavigation())
    act(() => result.current.push('checkout'))
    const before = window.history.length
    act(() => result.current.push('tracking', { orderId: 'x' }, { swap: true }))
    expect(names(result)).toEqual(['home', 'tracking'])
    expect(window.history.length).toBe(before)
    expect(window.location.hash).toBe('#/tracking')
  })

  test('cambiar de pestaña no crea historial', () => {
    const { result } = renderHook(() => useNavigation())
    const before = window.history.length
    act(() => result.current.setHomeTab('offers'))
    expect(result.current.homeTab).toBe('offers')
    expect(window.history.length).toBe(before)
    expect(window.location.hash).toBe('#/offers')
  })
})
