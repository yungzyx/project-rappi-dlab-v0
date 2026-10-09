import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { AssistantProvider, useAssistant } from '../../state/AssistantContext'
import { CartProvider, useCart } from '../../state/CartContext'
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
    <>
      <button type="button" onClick={() => assistant.open()}>
        abrir
      </button>
      <button type="button" onClick={(e) => assistant.open({ query: e.currentTarget.dataset.query })}>
        preguntar
      </button>
    </>
  )
}

/** Tras un pedido el carro es otro (CheckoutScreen llama a `clear`). */
function NewCartButton() {
  const cart = useCart()
  return (
    <button type="button" onClick={() => cart.clear()}>
      carro nuevo
    </button>
  )
}

const tracked = (type) => events.track.mock.calls.filter(([name]) => name === type).map(([, fields]) => fields)
const pair = (fields) => `${fields.concept_id}|${fields.vertical}`
const shownBy = (origin) => tracked('suggestion_shown').filter((fields) => fields.payload.origen === origin)
const countByPair = (list) =>
  list.reduce((counts, fields) => counts.set(pair(fields), (counts.get(pair(fields)) ?? 0) + 1), new Map())

/** Sin chat escrito, a Bigotes se le pregunta abriéndolo con una consulta (como el aviso del carrito o el seguimiento). */
async function send(text) {
  const ask = screen.getByText('preguntar')
  ask.dataset.query = text
  fireEvent.click(ask)
  await runUntilIdle()
}
const addAll = (container) =>
  within(container)
    .getAllByLabelText(/^Agregar /)
    .forEach((add) => fireEvent.click(add))
const lastSuggestion = () => [...document.querySelectorAll('.chat-suggestion')].at(-1)

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
  test('el saludo («Para ti») y el complemento cuentan como mostrados, y lo aceptado ahí no supera a lo mostrado', async () => {
    render(
      <DemoProvider>
        <ProfileProvider>
          <AssistantProvider>
            <CartProvider>
              <NudgeProvider>
                <OpenButton />
                <NewCartButton />
                <AssistantPanel push={() => {}} />
              </NudgeProvider>
            </CartProvider>
          </AssistantProvider>
        </ProfileProvider>
      </DemoProvider>,
    )
    fireEvent.click(screen.getByText('abrir'))
    await runUntilIdle()
    // El saludo trae «Para ti» del cerebro local (entre otros, cerveza de Licores).
    expect(shownBy('para-ti-local').map(pair)).toContain('cerveza|liquor')
    const [greeting] = document.querySelectorAll('.chat-products')
    addAll(greeting)

    await send('cerveza')
    // «¿Te tinca sumar snacks?»: el complemento, de otra vertical.
    expect(shownBy('chat-local').length).toBeGreaterThan(0)
    const snacks = lastSuggestion()
    addAll(snacks)
    // Tras un pedido, volver a agregar la misma sugerencia no es otra aceptación: se mostró una vez.
    fireEvent.click(screen.getByText('carro nuevo'))
    addAll(snacks)
    // El complemento de «pizza» es cerveza de Licores, que ya salió en el saludo pero desde otro origen.
    await send('pizza')
    expect(shownBy('chat-local').map(pair)).toContain('cerveza|liquor')
    addAll(lastSuggestion())

    const accepted = tracked('suggestion_accepted')
    expect(new Set(accepted.map((fields) => fields.payload.origen))).toEqual(new Set(['para-ti-local', 'chat-local']))
    // El panel agrupa por concepto y vertical: las aceptadas de cada par no pueden superar a sus mostradas.
    const shown = countByPair(tracked('suggestion_shown'))
    for (const [key, count] of countByPair(accepted)) expect(count, key).toBeLessThanOrEqual(shown.get(key) ?? 0)
  })
})
