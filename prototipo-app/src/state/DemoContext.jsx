import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

// "actual" = Rappi como es hoy; "final" = el prototipo final: Bigotes de cuerpo entero vive en la Home y la reordena
// para la persona, y el buscador es el de Bigotes. Reúne lo que antes eran «Propuesta» y «Bigotes vivo».
const STORAGE_KEY = 'rappi-proto-demo-mode'
const MODES = ['final', 'actual']
export const MODE_LABELS = { final: 'Prototipo final ✨', actual: 'Rappi hoy' }

// Cualquier otro valor guardado (los modos viejos «propuesta» y «vivo» incluidos) entra al prototipo final.
function load() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'actual' ? 'actual' : 'final'
  } catch {
    return 'final'
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

  const value = useMemo(
    () => ({ mode, isFinal: mode === 'final', setMode, toggle }),
    [mode, setMode, toggle],
  )

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}

export const useDemo = () => useContext(DemoContext)
