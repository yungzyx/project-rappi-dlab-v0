import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as progress from '../game/progress.js'
import { clear, load, save } from '../game/storage.js'

const GameContext = createContext(null)
const DATE_CHECK_MS = 30_000

/**
 * Estado del juego: cada acción aplica la función pura de progress.js sobre el último estado (una referencia, para que
 * dos acciones en el mismo toque no se pisen), lo guarda en el navegador y deja avisos para celebrar: misión del día
 * completa y nivel de explorador nuevo.
 */
export function GameProvider({ children }) {
  const [state, setState] = useState(load)
  const latest = useRef(state)
  const [date, setDate] = useState(progress.today)
  const [events, setEvents] = useState([])

  // La fecha se revisa cada 30 s y al volver a la pestaña: con la app abierta pasada la medianoche, la misión del
  // día y la racha pasan al día nuevo sin esperar a la próxima acción.
  useEffect(() => {
    const refresh = () => setDate(progress.today())
    const timer = setInterval(refresh, DATE_CHECK_MS)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  const commit = useCallback((next) => {
    latest.current = next
    setState(next)
    save(next)
  }, [])

  const run = useCallback(
    (action) => {
      const before = latest.current
      const result = action(before, progress.today())
      commit(result.state)
      const found = []
      if (result.bonus > 0) found.push({ type: 'mision', value: result.bonus, streak: result.state.streak.count })
      for (const level of progress.levelsGained(before.xp, result.state.xp)) found.push({ type: 'nivel', value: level })
      if (found.length) setEvents((list) => [...list, ...found])
      return result
    },
    [commit],
  )

  // Estables entre renders: el aviso usa dismissEvent en su temporizador.
  const dismissEvent = useCallback(() => setEvents((list) => list.slice(1)), [])
  const clearEvents = useCallback(() => setEvents([]), [])

  const value = useMemo(
    () => ({
      state,
      date,
      events,
      discover: (vertical, conceptId) => run((s, d) => progress.discover(s, vertical, conceptId, d)),
      answer: (vertical, isCorrect) => run((s, d) => progress.answer(s, vertical, isCorrect, d)),
      openCard: (cardId) => run((s, d) => progress.openCard(s, cardId, d)),
      seeIntro: () => commit(progress.markIntroSeen(latest.current)),
      dismissEvent,
      clearEvents,
      reset: () => {
        clear()
        latest.current = progress.initialState()
        setState(latest.current)
        setEvents([])
      },
    }),
    [state, date, events, run, commit, dismissEvent, clearEvents],
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  return useContext(GameContext)
}
