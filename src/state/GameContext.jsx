import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import * as progress from '../game/progress.js'
import { clear, load, save } from '../game/storage.js'

const GameContext = createContext(null)

/** Estado del juego: cada acción aplica la función pura de progress.js y guarda en el navegador. */
export function GameProvider({ children }) {
  const [state, setState] = useState(load)

  const apply = useCallback((result) => {
    setState(result.state)
    save(result.state)
    return result
  }, [])

  const value = useMemo(
    () => ({
      state,
      date: progress.today(),
      discover: (vertical, conceptId) => apply(progress.discover(state, vertical, conceptId, progress.today())),
      answer: (vertical, isCorrect) => apply(progress.answer(state, vertical, isCorrect, progress.today())),
      openCard: (cardId) => apply(progress.openCard(state, cardId, progress.today())),
      reset: () => {
        clear()
        setState(progress.initialState())
      },
    }),
    [state, apply],
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  return useContext(GameContext)
}
