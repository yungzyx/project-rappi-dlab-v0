import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AssistantProvider } from '../../state/AssistantContext'
import { CartProvider } from '../../state/CartContext'
import { DemoProvider } from '../../state/DemoContext'
import { NudgeProvider } from '../../state/NudgeContext'
import { ProfileProvider } from '../../state/ProfileContext'
import SearchScreen from './SearchScreen'

const events = vi.hoisted(() => ({ track: vi.fn(), flush: async () => {}, clear: () => {}, settled: async () => {} }))
vi.mock('../../state/EventsContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useEvents: () => events,
}))

function Providers({ children }) {
  return (
    <DemoProvider>
      <ProfileProvider>
        <AssistantProvider>
          <CartProvider>
            <NudgeProvider>{children}</NudgeProvider>
          </CartProvider>
        </AssistantProvider>
      </ProfileProvider>
    </DemoProvider>
  )
}

const searches = () => events.track.mock.calls.filter(([type]) => type === 'search').map(([, fields]) => fields)

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  events.track.mockClear()
  localStorage.clear()
})

describe('SearchScreen', () => {
  const setup = (params = {}) => {
    render(<SearchScreen back={() => {}} push={() => {}} params={params} />, { wrapper: Providers })
    return screen.getByPlaceholderText('What do you want today?')
  }

  test('la búsqueda lleva la vertical de la pantalla desde la que se abrió (el embudo es por vertical)', () => {
    const input = setup({ vertical: 'liquor' })
    fireEvent.change(input, { target: { value: 'pisco' } })
    fireEvent.blur(input)
    expect(searches()[0]).toMatchObject({ query: 'pisco', vertical: 'liquor' })
  })

  test('una palabra a medio escribir no es una búsqueda: se registra al dar Enter, una vez y sin "unmet"', () => {
    const input = setup()
    fireEvent.change(input, { target: { value: 'piz' } })
    act(() => vi.advanceTimersByTime(2000))
    expect(searches()).toEqual([])
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)
    expect(searches()).toHaveLength(1)
    expect(searches()[0]).toMatchObject({ query: 'piz', modality: 'texto' })
    expect(searches()[0]).not.toHaveProperty('unmet')
  })

  test('al salir del campo se registra lo buscado; sin resultados locales tampoco es "unmet"', () => {
    const input = setup()
    fireEvent.change(input, { target: { value: 'xyzxyz' } })
    fireEvent.blur(input)
    expect(searches()).toEqual([{ query: 'xyzxyz', modality: 'texto', results: 0 }])
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(searches()).toHaveLength(1)
  })

  test('tocar una búsqueda sugerida cuenta como buscarla', () => {
    setup()
    fireEvent.click(screen.getByText('Pizza'))
    expect(searches()).toEqual([expect.objectContaining({ query: 'Pizza', modality: 'texto' })])
  })

  test('el campo no acepta más de lo que guarda el servidor', () => {
    expect(setup().maxLength).toBe(500)
  })
})
