import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ALL_PRODUCTS } from '../../data/catalog'
import { AssistantProvider, useAssistant } from '../../state/AssistantContext'
import { NudgeProvider, useNudge } from '../../state/NudgeContext'
import Nudge from './Nudge'

const events = vi.hoisted(() => ({ track: vi.fn(), flush: async () => {}, clear: () => {}, settled: async () => {} }))
vi.mock('../../state/EventsContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useEvents: () => events,
}))

afterEach(() => {
  cleanup()
  events.track.mockClear()
})

describe('Nudge', () => {
  test('las sugerencias del aviso llevan concepto y vertical, y "mostrada" cuenta una vez por aviso', () => {
    const api = {}
    function Capture() {
      api.assistant = useAssistant()
      api.nudge = useNudge()
      return null
    }
    render(
      <AssistantProvider>
        <NudgeProvider>
          <Capture />
          <Nudge />
        </NudgeProvider>
      </AssistantProvider>,
    )
    // Cerveza → el aviso sugiere 🍿 snacks (de OXXO, en Express).
    act(() => api.nudge.offer(ALL_PRODUCTS.find((product) => product.id === 'p-heineken')))
    act(() => api.assistant.open())
    act(() => api.assistant.close({ viaHistory: true }))

    const shown = events.track.mock.calls.filter(([type]) => type === 'suggestion_shown')
    expect(shown).toHaveLength(1)
    expect(shown[0][1]).toMatchObject({
      concept_id: 'snacks-salados',
      vertical: 'express',
      payload: { from: 'cerveza', to: 'snack' },
    })

    fireEvent.click(screen.getByLabelText('Cerrar'))
    expect(events.track).toHaveBeenLastCalledWith(
      'suggestion_dismissed',
      expect.objectContaining({ concept_id: 'snacks-salados', vertical: 'express' }),
    )
  })
})
