import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { conceptsOf } from '../game/data.js'
import { FACTS } from '../game/facts.js'
import { initialState } from '../game/progress.js'
import { KEY } from '../game/storage.js'
import { GameProvider, useGame } from './GameContext.jsx'

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function Probe({ onClick }) {
  const game = useGame()
  return (
    <>
      <p data-testid="xp">{game.state.xp}</p>
      <p data-testid="date">{game.date}</p>
      <p data-testid="events">{game.events.map((e) => `${e.type}:${e.value}`).join(',')}</p>
      <button type="button" onClick={() => onClick(game)}>
        actuar
      </button>
      <button type="button" onClick={() => game.dismissEvent()}>
        cerrar
      </button>
    </>
  )
}

const renderProbe = (onClick = () => {}) =>
  render(
    <GameProvider>
      <Probe onClick={onClick} />
    </GameProvider>,
  )

describe('estado del juego', () => {
  test('dos acciones en el mismo toque no se pisan', () => {
    const [a, b] = conceptsOf('turbo')
    renderProbe((game) => {
      game.discover('turbo', a.id)
      game.discover('turbo', b.id)
    })
    fireEvent.click(screen.getByText('actuar'))
    expect(screen.getByTestId('xp').textContent).toBe('20')
    expect(JSON.parse(localStorage.getItem(KEY)).discovered.turbo).toEqual([a.id, b.id])
  })

  test('la fecha cambia sola pasada la medianoche', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date(2026, 9, 8, 23, 59, 30))
    renderProbe()
    expect(screen.getByTestId('date').textContent).toBe('2026-10-08')
    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByTestId('date').textContent).toBe('2026-10-09')
  })

  test('avisa al completar la misión del día y al subir de nivel', () => {
    const [a, b] = conceptsOf('supermercado')
    const card = FACTS[0].id
    localStorage.setItem(KEY, JSON.stringify({ ...initialState(), xp: 50, cards: [card] }))
    renderProbe((game) => {
      game.discover('supermercado', a.id)
      game.discover('supermercado', b.id)
      game.answer('supermercado', true)
      game.openCard(card)
    })
    fireEvent.click(screen.getByText('actuar'))
    // 50 + 10 + 10 + 20 = 90; la misión suma 50 → 140: nivel 2.
    expect(screen.getByTestId('xp').textContent).toBe('140')
    expect(screen.getByTestId('events').textContent).toBe('mision:50,nivel:2')
    fireEvent.click(screen.getByText('cerrar'))
    expect(screen.getByTestId('events').textContent).toBe('nivel:2')
  })
})
