import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

// "actual" = Rappi como es hoy; "propuesta" = con Bigotes y recomendaciones entre verticales; "vivo" = tercer
// prototipo de prueba: Bigotes de cuerpo entero vive en la Home y la reordena para la persona, sin chat.
const STORAGE_KEY = 'rappi-proto-demo-mode'
const MODES = ['propuesta', 'actual', 'vivo']
export const MODE_LABELS = { propuesta: 'Propuesta ✨', actual: 'Rappi hoy', vivo: 'Bigotes vivo 🧡' }

function load() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return MODES.includes(saved) ? saved : 'propuesta'
  } catch {
    return 'propuesta'
  }
}

function persist(mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Sin almacenamiento: el modo dura hasta recargar.
  }
}

export const nextMode = (mode) => MODES[(MODES.indexOf(mode) + 1) % MODES.length]

const DemoContext = createContext(null)

export function DemoProvider({ children }) {
  const [mode, setModeState] = useState(load)

  const setMode = useCallback((next) => {
    persist(next)
    setModeState(next)
  }, [])

  const toggle = useCallback(() => {
    setModeState((prev) => {
      persist(nextMode(prev))
      return nextMode(prev)
    })
  }, [])

  // Tecla D para cambiar de modo en vivo durante una presentación (salvo mientras se escribe).
  useEffect(() => {
    const onKey = (event) => {
      if (event.key.toLowerCase() !== 'd' || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.target.closest?.('input, textarea, [contenteditable="true"]')) return
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  // El modo vivo usa el mismo cerebro que la propuesta (perfil, sugerencias, eventos); solo cambia cómo se muestra.
  const value = useMemo(
    () => ({ mode, isProposal: mode !== 'actual', isLive: mode === 'vivo', setMode, toggle }),
    [mode, setMode, toggle],
  )

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}

export const useDemo = () => useContext(DemoContext)
