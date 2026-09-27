import { useEffect, useRef, useState } from 'react'

const INITIAL = { stack: [{ name: 'home', params: {} }], homeTab: 'home' }

/** URL legible (#/vertical/store) para que cada pantalla tenga su propio link. */
function hashFor(nav) {
  const names = nav.stack.slice(1).map((entry) => entry.name)
  return `#/${names.length > 0 ? names.join('/') : nav.homeTab}`
}

// history.state solo acepta datos clonables: el viaje por JSON descarta funciones o componentes que se cuelen.
const toState = (nav, extra = {}) => ({ nav: JSON.parse(JSON.stringify(nav)), ...extra })

function readInitial() {
  return window.history.state?.nav ?? INITIAL
}

/**
 * Pila de pantallas sincronizada con el historial del navegador:
 * - push agrega una entrada (o reemplaza la actual con { replace: true });
 * - back usa history.back(), así el gesto "volver" de Safari y el botón ‹ hacen lo mismo;
 * - al recargar se recupera la pantalla desde history.state.
 */
export function useNavigation() {
  const [nav, setNav] = useState(readInitial)
  const [direction, setDirection] = useState('none')
  const navRef = useRef(nav)
  const backIsOurs = useRef(false)

  useEffect(() => {
    navRef.current = nav
  }, [nav])

  useEffect(() => {
    // Primera carga (o recarga con el asistente abierto): deja una entrada limpia de la pantalla actual.
    window.history.replaceState(toState(navRef.current), '', hashFor(navRef.current))

    const onPopState = (event) => {
      const next = event.state?.nav
      if (!next) return
      // Si el retroceso vino del gesto de Safari, el navegador ya animó: no repetir la animación.
      setDirection(backIsOurs.current ? 'pop' : 'none')
      backIsOurs.current = false
      setNav(next)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const push = (name, params = {}, { replace = false } = {}) => {
    const next = { ...navRef.current, stack: [...navRef.current.stack, { name, params }] }
    if (replace) window.history.replaceState(toState(next), '', hashFor(next))
    else window.history.pushState(toState(next), '', hashFor(next))
    navRef.current = next
    setDirection('push')
    setNav(next)
  }

  const back = () => {
    if (navRef.current.stack.length <= 1) return
    backIsOurs.current = true
    window.history.back()
  }

  // Cambiar de pestaña no crea historial (como en la app real): solo actualiza la entrada actual.
  const setHomeTab = (homeTab) => {
    const next = { ...navRef.current, homeTab }
    window.history.replaceState(toState(next), '', hashFor(next))
    navRef.current = next
    setNav(next)
  }

  return { stack: nav.stack, homeTab: nav.homeTab, direction, push, back, setHomeTab }
}
