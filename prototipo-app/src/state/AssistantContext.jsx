import { createContext, useContext, useMemo, useState } from 'react'

const AssistantContext = createContext(null)

/**
 * Abre y cierra el asistente. `open({ mode, origin, photo })`:
 *  - mode: 'chat' | 'voice' | 'photo'
 *  - origin: rectángulo (relativo al teléfono) desde donde crece la animación
 *  - photo: URL local de la foto elegida
 */
export function AssistantProvider({ children }) {
  const [session, setSession] = useState(null)

  const value = useMemo(
    () => ({
      session,
      isOpen: session !== null,
      open: (options = {}) => setSession({ mode: 'chat', ...options, openedAt: Date.now() }),
      close: () => setSession(null),
    }),
    [session],
  )

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>
}

export const useAssistant = () => useContext(AssistantContext)

/** Rectángulo de un elemento relativo al teléfono (el teléfono puede estar escalado con zoom). */
export function rectInPhone(element) {
  const phone = element.closest('.phone')
  const zoom = parseFloat(getComputedStyle(phone).zoom) || 1
  const outer = phone.getBoundingClientRect()
  const inner = element.getBoundingClientRect()
  return {
    top: (inner.top - outer.top) / zoom,
    left: (inner.left - outer.left) / zoom,
    width: inner.width / zoom,
    height: inner.height / zoom,
    phoneWidth: outer.width / zoom,
    phoneHeight: outer.height / zoom,
  }
}
