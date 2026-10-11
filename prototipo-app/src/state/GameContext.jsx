import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { cards, gameState, saveGameState } from '../api/game'
import { ApiError } from '../api/client'
import { userId } from '../api/user'
import { ConnectionNotice } from '../components/ConnectionGate'
import { setKnowledge } from '../game/knowledge.js'
import * as progress from '../game/progress.js'
import { createSaver } from '../game/saver.js'
import { clearLegacy, legacyProgress } from '../game/storage.js'
import { SCREEN_TO_GAME } from '../game/verticals.js'
import { REPLAY_EVENT } from './liveMemory'

const GameContext = createContext(null)
const DATE_CHECK_MS = 30_000

/** Un 4xx (422, 409…) es el servidor diciendo «esto no»: reintentar no lo arregla. Red caída y 5xx sí pueden mejorar. */
const isRejection = (error) => error instanceof ApiError && error.kind === 'http' && error.status >= 400 && error.status < 500

/**
 * Las tarjetas y el progreso del servidor, en ese orden. El progreso que este navegador guardó antes (ya no se escribe)
 * se traspasa una sola vez: si el servidor no tiene progreso, sube el del navegador y recién ahí se borra (la respuesta
 * del PUT, ya limpia, es el estado); si el servidor tiene, gana el del servidor y el del navegador se borra. Si la red
 * falla, no se borra nada y se muestra «Sin conexión». Si el servidor rechaza el traspaso (4xx), tampoco se borra nada,
 * pero la app no se bloquea: avisa en la consola y parte en cero.
 */
async function loadGame(local) {
  setKnowledge(await cards())
  const id = userId()
  let state = await gameState(id)
  if (!state && local) {
    try {
      state = await saveGameState(id, local)
    } catch (error) {
      if (!isRejection(error)) throw error
      console.warn('El servidor rechazó el traspaso del progreso viejo; el juego parte en cero.', error)
      return progress.initialState()
    }
  }
  clearLegacy()
  return { ...progress.initialState(), ...state }
}

// La carga en curso, por usuario: con StrictMode el efecto corre dos veces y las dos comparten la misma (un solo
// GET y un solo PUT del traspaso). Se suelta al terminar, bien o mal, para que «Reintentar» empiece de cero.
let inFlight = null
function loadOnce(local) {
  const id = userId()
  if (inFlight?.id === id) return inFlight.promise
  const promise = loadGame(local)
  inFlight = { id, promise }
  const release = () => {
    if (inFlight?.promise === promise) inFlight = null
  }
  promise.then(release, release)
  return promise
}

/**
 * Estado del juego: antes de pintar a sus hijos carga las tarjetas y el progreso del servidor (con «Sin conexión» y
 * «Reintentar» si no puede). Cada acción aplica la función pura de progress.js sobre el último estado (una referencia,
 * para que dos acciones en el mismo toque no se pisen), lo guarda en el servidor y deja avisos para celebrar: misión
 * del día completa y nivel de explorador nuevo. El progreso nunca se escribe en el navegador.
 */
export function GameProvider({ children }) {
  const [state, setState] = useState(progress.initialState)
  const latest = useRef(state)
  const [loaded, setLoaded] = useState('loading') // 'loading' | 'ready' | 'offline'
  const [attempt, setAttempt] = useState(0)
  const saver = useRef(null)
  saver.current ??= createSaver((next) => saveGameState(userId(), next))
  const [date, setDate] = useState(progress.today)
  const [events, setEvents] = useState([])
  // Sube en cada reinicio: las pantallas del juego lo usan de `key` para no seguir con una ronda vieja.
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    let current = true
    const local = legacyProgress()
    loadOnce(local).then(
      (loadedState) => {
        if (!current) return
        latest.current = loadedState
        setState(loadedState)
        setLoaded('ready')
      },
      () => current && setLoaded('offline'),
    )
    return () => {
      current = false
    }
  }, [attempt])

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

  const reset = useCallback(() => {
    latest.current = progress.initialState()
    setState(latest.current)
    saver.current.save(latest.current)
    setEvents([])
    setGeneration((n) => n + 1)
  }, [])

  // «Repetir escena» (junto al teléfono o en Account) deja también el juego como al empezar. Mientras carga no hay nada
  // que reiniciar, y reiniciar entonces pisaría el progreso del servidor.
  useEffect(() => {
    if (loaded !== 'ready') return
    window.addEventListener(REPLAY_EVENT, reset)
    return () => window.removeEventListener(REPLAY_EVENT, reset)
  }, [reset, loaded])

  const commit = useCallback((next) => {
    latest.current = next
    setState(next)
    saver.current.save(next)
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
      generation,
      discover: (vertical, conceptId) => run((s, d) => progress.discover(s, vertical, conceptId, d)),
      // `cardId`: la pregunta de conocimiento respondida (si se acierta, entra al álbum); sin él, un desafío del catálogo.
      answer: (vertical, isCorrect, cardId) => run((s, d) => progress.answer(s, vertical, isCorrect, d, cardId)),
      openCard: (cardId) => run((s, d) => progress.openCard(s, cardId, d)),
      seeIntro: () => commit(progress.markIntroSeen(latest.current)),
      // Abrir una vertical en la app (id de pantalla del prototipo) la sella. Devuelve si el sello es nuevo.
      visit: (screenId) => {
        const vertical = SCREEN_TO_GAME[screenId]
        return vertical ? run((s) => progress.visit(s, vertical)).isNew : false
      },
      dismissEvent,
      clearEvents,
      reset,
    }),
    [state, date, events, generation, run, commit, dismissEvent, clearEvents, reset],
  )

  if (loaded !== 'ready') {
    const retry = () => {
      setLoaded('loading')
      setAttempt((n) => n + 1)
    }
    return <ConnectionNotice status={loaded === 'offline' ? 'offline' : 'checking'} onRetry={retry} />
  }
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  return useContext(GameContext)
}
