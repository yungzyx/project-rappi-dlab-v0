import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { AssistantProvider, useAssistant } from '../state/AssistantContext'
import { DemoProvider, useDemo } from '../state/DemoContext'
import { useOpenSearch } from './useOpenSearch'

const wrapper = ({ children }) => (
  <DemoProvider>
    <AssistantProvider>{children}</AssistantProvider>
  </DemoProvider>
)

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('useOpenSearch', () => {
  const setup = (mode) => {
    const push = vi.fn()
    const { result } = renderHook(() => ({ open: useOpenSearch(push), demo: useDemo(), assistant: useAssistant() }), {
      wrapper,
    })
    act(() => result.current.demo.setMode(mode))
    return { push, result }
  }

  test('en la Propuesta abre el buscador con Bigotes con la vertical', () => {
    const { push, result } = setup('propuesta')
    act(() => result.current.open('liquor'))
    expect(push).not.toHaveBeenCalled()
    expect(result.current.assistant.session).toMatchObject({ vertical: 'liquor' })
  })

  test('en «Rappi hoy» abre el buscador plano', () => {
    const { push, result } = setup('actual')
    act(() => result.current.open('turbo'))
    expect(push).toHaveBeenCalledWith('search', { vertical: 'turbo' })
    expect(result.current.assistant.isOpen).toBe(false)
  })

  test('en «Bigotes vivo» sigue abriendo el buscador plano, sin vertical desde la Home', () => {
    const { push, result } = setup('vivo')
    act(() => result.current.open())
    expect(push).toHaveBeenCalledWith('search', {})
  })
})
