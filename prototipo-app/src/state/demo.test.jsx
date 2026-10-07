import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { DemoProvider, MODE_LABELS, useDemo } from './DemoContext'

const wrapper = ({ children }) => <DemoProvider>{children}</DemoProvider>

describe('modo Bigotes vivo', () => {
  beforeEach(() => localStorage.clear())

  it('es un tercer modo: con el cerebro de la propuesta, sin chat', () => {
    localStorage.setItem('rappi-proto-demo-mode', 'vivo')
    const { result } = renderHook(() => useDemo(), { wrapper })
    expect(result.current.mode).toBe('vivo')
    expect(result.current.isProposal).toBe(true)
    expect(result.current.isLive).toBe(true)
    expect(Object.keys(MODE_LABELS)).toEqual(['propuesta', 'actual', 'vivo'])
  })

  it('la tecla D y «toggle» recorren los tres modos', () => {
    const { result } = renderHook(() => useDemo(), { wrapper })
    const seen = [result.current.mode]
    for (let i = 0; i < 3; i += 1) {
      act(() => result.current.toggle())
      seen.push(result.current.mode)
    }
    expect(seen).toEqual(['propuesta', 'actual', 'vivo', 'propuesta'])
    expect(result.current.isLive).toBe(false)
  })
})
