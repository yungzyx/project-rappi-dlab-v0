import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

// "actual" = Rappi como es hoy; "propuesta" = con Bigotes y recomendaciones entre verticales.
const STORAGE_KEY = 'rappi-proto-demo-mode'
const MODES = ['propuesta', 'actual']
export const MODE_LABELS = { propuesta: 'Propuesta ✨', actual: 'Rappi hoy' }

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

const other = (mode) => (mode === 'propuesta' ? 'actual' : 'propuesta')

const DemoContext = createContext(null)

export function DemoProvider({ children }) {
  const [mode, setModeState] = useState(load)

  const setMode = useCallback((next) => {
    persist(next)
    setModeState(next)
  }, [])

  const toggle = useCallback(() => {
    setModeState((prev) => {
      persist(other(prev))
      return other(prev)
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

  const value = useMemo(() => ({ mode, isProposal: mode === 'propuesta', setMode, toggle }), [mode, setMode, toggle])

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}

export const useDemo = () => useContext(DemoContext)
