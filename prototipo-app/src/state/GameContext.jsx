import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { cards, gameState, saveGameState, saveGameStateOnHide } from '../api/game'
import { ApiError } from '../api/client'
import { userId } from '../api/user'
import { setKnowledge } from '../game/knowledge.js'
import * as progress from '../game/progress.js'
import { createSaver } from '../game/saver.js'
import { clearLegacy, legacyProgress } from '../game/storage.js'
import { SCREEN_TO_GAME } from '../game/verticals.js'
import { useEvents } from './EventsContext'
import { REPLAY_EVENT } from './liveMemory'

const GameContext = createContext(null)
const DATE_CHECK_MS = 30_000

/** Un 4xx (422, 409…) es el servidor diciendo «esto no»: reintentar no lo arregla. Red caída y 5xx sí pueden mejorar. */
const isRejection = (error) => error instanceof ApiError && error.kind === 'http' && error.status >= 400 && error.status < 500

/** Una tarjeta es nueva si no está en las descubiertas de su vertical ni en el álbum. */
const isNewCard = (state, vertical, cardId) =>
  Boolean(cardId) && !(state.discovered[vertical] ?? []).includes(cardId) && !state.cards.includes(cardId)

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
 * Estado del juego. Monta siempre a sus hijos (un fallo del juego no bloquea la tienda) y carga en segundo plano las
 * tarjetas y el progreso del servidor: `status` es 'loading', 'ready' u 'offline' (`retry()` vuelve a intentar), y las
 * pantallas del juego muestran su propio «Sin conexión» con «Reintentar». Mientras no esté 'ready', las acciones
 * (`discover`, `visit`…) no hacen nada: partir de un estado en cero y guardarlo pisaría el progreso del servidor. Cada
 * acción aplica la función pura de progress.js sobre el último estado (una referencia,
 * para que dos acciones en el mismo toque no se pisen), lo guarda en el servidor y deja avisos para celebrar: misión
 * del día completa y nivel de explorador nuevo. El progreso nunca se escribe en el navegador.
 */
export function GameProvider({ children }) {
  const [state, setState] = useState(progress.initialState)
  const latest = useRef(state)
  const { track } = useEvents()
  const paused = useRef(false) // «Olvidar» pausó el guardado (ver `settle`)
  const [loaded, setLoaded] = useState('loading') // 'loading' | 'ready' | 'offline'
  const ready = useRef(false) // `loaded === 'ready'`, legible desde las acciones sin esperar al render
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
        ready.current = true
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

  // Un guardado que falló se reintenta solo (ver saver.js); además, al volver la red o la pestaña se reenvía ya, y al
  // cerrar la página el último estado sale con `keepalive` (el navegador lo completa aunque la página se descargue).
  useEffect(() => {
    const own = saver.current
    const retry = () => own.retry()
    const onVisible = () => document.visibilityState !== 'hidden' && own.retry()
    const onHide = () => {
      if (ready.current && !paused.current && own.pending()) saveGameStateOnHide(userId(), latest.current)
    }
    retry() // StrictMode desmonta y vuelve a montar: lo pendiente retoma sus reintentos
    window.addEventListener('online', retry)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('online', retry)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pagehide', onHide)
      own.stop()
    }
  }, [])

  // «Olvidar» del asistente ya borró el perfil en el servidor, y con él este progreso: el juego vuelve a cero solo en
  // memoria, sin subir nada (subirlo lo recrearía). La próxima acción lo guarda como el de un usuario nuevo.
  const forget = useCallback(() => {
    paused.current = false
    latest.current = progress.initialState()
    setState(latest.current)
    setEvents([])
    setGeneration((n) => n + 1)
  }, [])

  // «Olvidar» llama a `settle` justo antes del DELETE: el guardado en vuelo termina, el que estaba en cola no sale y el
  // juego queda en pausa (el progreso se sigue viendo en pantalla, pero no se guarda), así nada llega al servidor
  // después y recrea al usuario. Sale de la pausa con `forget` (el DELETE salió bien: el juego vuelve a cero) o con
  // `resume` (falló: guarda el estado actual una vez).
  const settle = useCallback(() => {
    paused.current = true
    return saver.current.cancel()
  }, [])
  const resume = useCallback(() => {
    paused.current = false
    if (ready.current) saver.current.save(latest.current)
  }, [])

  const reset = useCallback(() => {
    forget()
    saver.current.save(latest.current)
  }, [forget])

  // «Repetir escena» (junto al teléfono o en Account) deja también el juego como al empezar. Mientras carga no hay nada
  // que reiniciar, y reiniciar entonces pisaría el progreso del servidor.
  useEffect(() => {
    if (loaded !== 'ready') return
    window.addEventListener(REPLAY_EVENT, reset)
    return () => window.removeEventListener(REPLAY_EVENT, reset)
  }, [reset, loaded])

  // Una acción que no cambia nada (abrir una vertical ya sellada) devuelve el mismo estado: no hay nada que guardar.
  const commit = useCallback((next) => {
    if (next === latest.current) return
    latest.current = next
    setState(next)
    if (!paused.current) saver.current.save(next)
  }, [])

  const run = useCallback(
    (action) => {
      // Sin el progreso del servidor cargado no hay sobre qué actuar.
      if (!ready.current) return { state: latest.current, xp: 0, bonus: 0, isNew: false }
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

  const retry = useCallback(() => {
    setLoaded('loading')
    setAttempt((n) => n + 1)
  }, [])

  const value = useMemo(
    () => ({
      state,
      status: loaded,
      retry,
      date,
      events,
      generation,
      discover: (vertical, cardId) => {
        const fresh = ready.current && isNewCard(latest.current, vertical, cardId)
        const result = run((s, d) => progress.discover(s, vertical, cardId, d))
        if (fresh) track('game_card_discovered', { payload: { vertical_juego: vertical, tarjeta: cardId } })
        return result
      },
      // `cardId`: la pregunta de conocimiento respondida (si se acierta, entra al álbum); sin él, un desafío del catálogo.
      answer: (vertical, isCorrect, cardId) => {
        const fresh = ready.current && isCorrect && isNewCard(latest.current, vertical, cardId)
        const result = run((s, d) => progress.answer(s, vertical, isCorrect, d, cardId))
        if (fresh) track('game_card_discovered', { payload: { vertical_juego: vertical, tarjeta: cardId } })
        return result
      },
      openCard: (cardId) => run((s, d) => progress.openCard(s, cardId, d)),
      seeIntro: () => ready.current && commit(progress.markIntroSeen(latest.current)),
      // Abrir una vertical en la app (id de pantalla del prototipo) la sella. Devuelve si el sello es nuevo.
      visit: (screenId) => {
        const vertical = SCREEN_TO_GAME[screenId]
        return vertical ? run((s) => progress.visit(s, vertical)).isNew : false
      },
      dismissEvent,
      clearEvents,
      reset,
      forget,
      settle,
      resume,
    }),
    [state, loaded, retry, date, events, generation, run, track, commit, dismissEvent, clearEvents, reset, forget, settle, resume],
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  return useContext(GameContext)
}
