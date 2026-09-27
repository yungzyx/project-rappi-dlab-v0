import { createContext, useContext, useMemo, useState } from 'react'

const LoyaltyContext = createContext(null)

/** Programa de puntos vinculado (uno a la vez, como explica la pantalla Loyalty). */
export function LoyaltyProvider({ children }) {
  const [activeId, setActiveId] = useState(null)
  const value = useMemo(() => ({ activeId, link: setActiveId, unlink: () => setActiveId(null) }), [activeId])
  return <LoyaltyContext.Provider value={value}>{children}</LoyaltyContext.Provider>
}

export const useLoyalty = () => useContext(LoyaltyContext)
