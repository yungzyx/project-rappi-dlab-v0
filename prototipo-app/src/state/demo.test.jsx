import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DemoProvider, MODE_LABELS, useDemo } from './DemoContext'

const wrapper = ({ children }) => <DemoProvider>{children}</DemoProvider>

describe('modos de la demo: «Rappi hoy» y «Prototipo final»', () => {
  beforeEach(() => localStorage.clear())

  it('son dos: lo que hay hoy y el prototipo final, que arranca por defecto', () => {
    const { result } = renderHook(() => useDemo(), { wrapper })
    expect(result.current.mode).toBe('final')
    expect(result.current.isFinal).toBe(true)
    expect(Object.keys(MODE_LABELS)).toEqual(['final', 'actual'])
    expect(MODE_LABELS).toEqual({ final: 'Prototipo final ✨', actual: 'Rappi hoy' })
  })

  it('«Rappi hoy» guardado se respeta', () => {
    localStorage.setItem('rappi-proto-demo-mode', 'actual')
    const { result } = renderHook(() => useDemo(), { wrapper })
    expect(result.current.mode).toBe('actual')
    expect(result.current.isFinal).toBe(false)
  })

  it.each(['propuesta', 'vivo', 'otra-cosa'])('un modo viejo guardado («%s») entra al prototipo final', (saved) => {
    localStorage.setItem('rappi-proto-demo-mode', saved)
    const { result } = renderHook(() => useDemo(), { wrapper })
    expect(result.current.mode).toBe('final')
  })

  it('la tecla D y «toggle» alternan entre los dos', () => {
    const { result } = renderHook(() => useDemo(), { wrapper })
    const seen = [result.current.mode]
    for (let i = 0; i < 2; i += 1) {
      act(() => result.current.toggle())
      seen.push(result.current.mode)
    }
    expect(seen).toEqual(['final', 'actual', 'final'])
  })
})
