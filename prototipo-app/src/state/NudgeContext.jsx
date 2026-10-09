import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { COMPLEMENTS, productTags } from '../assistant/tags'

const VISIBLE_MS = 6000

const NudgeContext = createContext(null)

/**
 * Aviso de Mochi al agregar al carrito: sugiere el complemento del producto (de otra vertical).
 * Al salir un aviso, todos los temas del producto y el complemento sugerido cuentan como vistos:
 * dos cervezas seguidas (que también son "copete" por la botillería) no repiten el aviso.
 */
export function NudgeProvider({ children }) {
  const [nudge, setNudge] = useState(null)
  const shown = useRef(new Set())
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const dismiss = useCallback(() => setNudge(null), [])

  const offer = useCallback((product) => {
    const tags = productTags(product)
    if (tags.some((candidate) => shown.current.has(candidate))) return
    const tag = tags.find((candidate) => COMPLEMENTS[candidate])
    if (!tag) return
    const complement = COMPLEMENTS[tag][0]
    for (const seen of [...tags, complement]) shown.current.add(seen)
    setNudge({ id: Date.now(), tag, complement })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setNudge(null), VISIBLE_MS)
  }, [])

  const value = useMemo(() => ({ nudge, offer, dismiss }), [nudge, offer, dismiss])
  return <NudgeContext.Provider value={value}>{children}</NudgeContext.Provider>
}

export const useNudge = () => useContext(NudgeContext)
