import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { AssistantProvider, useAssistant } from '../../state/AssistantContext'
import { CartProvider } from '../../state/CartContext'
import { DemoProvider } from '../../state/DemoContext'
import { NudgeProvider } from '../../state/NudgeContext'
import { ProfileProvider } from '../../state/ProfileContext'
import AssistantPanel from './AssistantPanel'

// La API está arriba (los eventos llegan al panel), pero el chat falla: contesta el cerebro local.
const api = vi.hoisted(() => ({
  health: vi.fn(async () => ({ voz: false, fotos: false })),
  chat: vi.fn(async () => {
    throw new Error('chat caído')
  }),
  profile: vi.fn(async () => ({ interests: [] })),
}))
vi.mock('../../api/client', async (importOriginal) => ({ ...(await importOriginal()), ...api }))
const events = vi.hoisted(() => ({ track: vi.fn(), flush: async () => {}, clear: () => {}, settled: async () => {} }))
vi.mock('../../state/EventsContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useEvents: () => events,
}))

/** Avanza de a poco hasta que el chat termina («escribiendo…» y el texto letra por letra). */
async function runUntilIdle() {
  await act(() => vi.advanceTimersByTimeAsync(0))
  for (let i = 0; i < 100 && vi.getTimerCount() > 0; i++) await act(() => vi.advanceTimersByTimeAsync(250))
}

function OpenButton() {
  const assistant = useAssistant()
  return (
    <button type="button" onClick={() => assistant.open()}>
      abrir
    </button>
  )
}

const tracked = (type) => events.track.mock.calls.filter(([name]) => name === type).map(([, fields]) => fields)
const pair = (fields) => `${fields.concept_id}|${fields.vertical}`
const shownBy = (origin) => tracked('suggestion_shown').filter((fields) => fields.payload.origen === origin)

beforeAll(() => {
  Element.prototype.scrollTo = () => {} // jsdom no lo implementa
  vi.useFakeTimers()
})
afterAll(() => {
  delete Element.prototype.scrollTo
  vi.useRealTimers()
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})

describe('sugerencias del cerebro local en el chat', () => {
  test('el saludo («Para ti») y el complemento cuentan como mostrados, y lo aceptado ahí tiene su mostrada', async () => {
    render(
      <DemoProvider>
        <ProfileProvider>
          <AssistantProvider>
            <CartProvider>
              <NudgeProvider>
                <OpenButton />
                <AssistantPanel push={() => {}} />
              </NudgeProvider>
            </CartProvider>
          </AssistantProvider>
        </ProfileProvider>
      </DemoProvider>,
    )
    fireEvent.click(screen.getByText('abrir'))
    await runUntilIdle()
    // El saludo trae «Para ti» del cerebro local.
    expect(shownBy('para-ti-local').length).toBeGreaterThan(0)
    const [greeting] = document.querySelectorAll('.chat-products')
    fireEvent.click(within(greeting).getAllByLabelText(/^Agregar /)[0])

    const input = screen.getByPlaceholderText('Escríbele a Bigotes…')
    fireEvent.change(input, { target: { value: 'cerveza' } })
    fireEvent.submit(input.closest('form'))
    await runUntilIdle()
    // «¿Te tinca sumar snacks?»: el complemento, de otra vertical.
    expect(shownBy('chat-local').length).toBeGreaterThan(0)
    const suggestion = document.querySelector('.chat-suggestion')
    fireEvent.click(within(suggestion).getAllByLabelText(/^Agregar /)[0])

    const accepted = tracked('suggestion_accepted')
    expect(accepted.map((fields) => fields.payload.origen)).toEqual(['para-ti-local', 'chat-local'])
    const shown = tracked('suggestion_shown').map(pair)
    for (const fields of accepted) expect(shown).toContain(pair(fields))
  })
})
