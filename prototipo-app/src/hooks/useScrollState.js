import { useRef, useState } from 'react'

/** Posición de scroll y si el usuario va subiendo (para encabezados compactos y "Back to top"). */
export function useScrollState() {
  const lastTop = useRef(0)
  const [state, setState] = useState({ top: 0, goingUp: false })

  const onScroll = (e) => {
    const top = e.currentTarget.scrollTop
    const goingUp = top < lastTop.current
    lastTop.current = top
    setState((prev) => (prev.top === top && prev.goingUp === goingUp ? prev : { top, goingUp }))
  }
  return [state, onScroll]
}
