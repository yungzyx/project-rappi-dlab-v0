import { useEffect, useRef, useState } from 'react'
import { useAddToCart } from '../../hooks/useAddToCart'
import { useAssistant } from '../../state/AssistantContext'
import { formatPrice, useCart } from '../../state/CartContext'
import { useDemo } from '../../state/DemoContext'
import { MOCHI_CART_EVENT } from '../../state/liveMemory'
import { isHushed, isQuiet, noteDismissed, noteEngaged, quietToday, wake } from '../../state/mochiQuiet'
import { today } from '../../game/progress.js'
import Mascot from './Mascot'
import './mochi-presence.css'

// Donde Mochi no flota: ya está en la pantalla (la Home, el juego, el mapa del seguimiento) o estorba (el checkout).
export const MOCHI_HIDDEN_SCREENS = new Set(['checkout', 'tracking', 'game'])
export const SIDE_KEY = 'rappi-proto-mochi-lado'

const SIZE = 68
const JUMP_MS = 900 // al tocarlo salta, como en la Home
const SMALL_AFTER_SCROLL_MS = 750 // al hacer scroll se achica y vuelve un rato después
const DRAG_THRESHOLD_PX = 8 // menos que esto es un toque, no un arrastre
const CART_BUBBLE_MS = 4000

const readSide = () => {
  try {
    return localStorage.getItem(SIDE_KEY) === 'left' ? 'left' : 'right'
  } catch {
    return 'right'
  }
}

/**
 * Mochi flotando a un costado, fuera de la Home (prototipo final). Tocarlo abre un menú corto; arrastrarlo lo deja en
 * el lado más cercano. La posición sale solo del CSS: sobre la barra inferior o la del carrito según las clases.
 */
export default function MochiPresence({ screen, homeTab, raised }) {
  const demo = useDemo()
  const assistant = useAssistant()
  const cart = useCart()
  const { remove } = useAddToCart()
  const [added, setAdded] = useState(null) // lo último agregado, mientras dura su globo
  const [menu, setMenu] = useState(false)
  const [side, setSide] = useState(readSide)
  const [jumping, setJumping] = useState(false)
  const [small, setSmall] = useState(false)
  const [quiet, setQuiet] = useState(() => isQuiet(today()))
  const host = useRef(null)
  const body = useRef(null)
  const drag = useRef(null)
  const timers = useRef({})

  const hidden =
    !demo.isFinal || assistant.isOpen || MOCHI_HIDDEN_SCREENS.has(screen) || (screen === 'home' && homeTab === 'home')

  const later = (key, fn, ms) => {
    clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(fn, ms)
  }
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), [])

  // Al hacer scroll en el teléfono se achica para no tapar lo que se está mirando.
  useEffect(() => {
    const phone = host.current?.closest('.phone')
    if (!phone) return undefined
    const onScroll = () => {
      setSmall(true)
      later('small', () => setSmall(false), SMALL_AFTER_SCROLL_MS)
    }
    phone.addEventListener('scroll', onScroll, true)
    return () => phone.removeEventListener('scroll', onScroll, true)
  }, [hidden])

  // Al agregar al carro, una confirmación corta con «Deshacer». No sugiere nada: eso queda para la Home al volver.
  // En silencio (por hoy o porque lo ignoraron) no dice nada.
  useEffect(() => {
    if (hidden) return undefined
    const onAdded = (event) => {
      if (isQuiet(today()) || isHushed()) return
      setMenu(false)
      setAdded(event.detail.product)
      setJumping(true)
      later('jump', () => setJumping(false), JUMP_MS)
      later('added', () => setAdded(null), CART_BUBBLE_MS)
    }
    window.addEventListener(MOCHI_CART_EVENT, onAdded)
    return () => window.removeEventListener(MOCHI_CART_EVENT, onAdded)
  }, [hidden])

  // Escape o tocar fuera cierran el menú; con Escape el foco vuelve a Mochi.
  useEffect(() => {
    if (!menu) return undefined
    const onPointer = (event) => {
      if (!host.current?.contains(event.target)) setMenu(false)
    }
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      setMenu(false)
      body.current?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  if (hidden) return null

  const moveTo = (next) => {
    setSide(next)
    try {
      localStorage.setItem(SIDE_KEY, next)
    } catch {
      // Sin almacenamiento (ventana privada): el lado dura lo que dura la pestaña.
    }
  }

  const actions = [
    { id: 'search', label: 'Buscar con Mochi' },
    cart.count > 0
      ? { id: 'cart', label: `Revisar mi carrito · ${formatPrice(cart.total)}` }
      : { id: 'try', label: '¿Qué puedo probar?' },
    { id: 'move', label: side === 'right' ? 'Mover a la izquierda' : 'Mover a la derecha' },
    { id: 'quiet', label: 'Silenciar por hoy' },
  ]
  const run = (id) => {
    setMenu(false)
    noteEngaged()
    if (id === 'search') assistant.open()
    if (id === 'try') assistant.open({ query: 'Muéstrame algo nuevo para probar' })
    if (id === 'cart') host.current?.closest('.phone')?.querySelector('.cart-bar')?.click()
    if (id === 'move') moveTo(side === 'right' ? 'left' : 'right')
    if (id === 'quiet') {
      quietToday(today())
      setQuiet(true)
    }
  }

  // Silenciado por hoy: solo una pestañita en el borde, sin globos; tocarla lo despierta.
  if (quiet)
    return (
      <div ref={host} className={`mochi-presence is-quiet${side === 'left' ? ' is-left' : ''}`}>
        <button
          type="button"
          className="mochi-quiet-tab"
          aria-label="Mochi está en silencio: tocar para despertarlo"
          onClick={() => {
            wake()
            setQuiet(false)
          }}
        >
          <Mascot size={40} badge />
        </button>
      </div>
    )

  const down = (event) => {
    setJumping(true)
    later('jump', () => setJumping(false), JUMP_MS)
    drag.current = { x: event.clientX, moved: false }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const move = (event) => {
    const current = drag.current
    if (!current || current.moved || Math.abs(event.clientX - current.x) < DRAG_THRESHOLD_PX) return
    current.moved = true
    setMenu(false)
  }
  const up = (event) => {
    const current = drag.current
    if (!current?.moved) return
    const phone = host.current?.closest('.phone')?.getBoundingClientRect()
    if (phone) moveTo(event.clientX < phone.left + phone.width / 2 ? 'left' : 'right')
  }
  const toggle = () => {
    // Un arrastre no abre el menú.
    if (drag.current?.moved) {
      drag.current = null
      return
    }
    drag.current = null
    setMenu((open) => !open)
  }

  const classes = ['mochi-presence']
  if (side === 'left') classes.push('is-left')
  if (cart.count > 0) classes.push('has-cart')
  if (raised) classes.push('is-raised')
  if (small && !menu) classes.push('is-small')

  return (
    <div ref={host} className={classes.join(' ')}>
      {added && !menu && (
        <div className="mochi-popover mochi-bubble" role="status">
          <button
            type="button"
            className="mochi-bubble-close"
            aria-label="Cerrar"
            onClick={() => {
              noteDismissed()
              setAdded(null)
            }}
          >
            ×
          </button>
          <p>¡Listo! {added.name} está en tu carrito.</p>
          <button
            type="button"
            className="mochi-action tap"
            onClick={() => {
              noteEngaged()
              remove(added)
              setAdded(null)
            }}
          >
            Deshacer
          </button>
        </div>
      )}
      {menu && (
        <div className="mochi-popover" role="group" aria-label="Opciones de Mochi">
          <p>¿Qué hacemos juntos?</p>
          <div className="mochi-actions">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className="mochi-action tap"
                onClick={() => run(action.id)}
              >
                {action.label}
              </button>
            ))}
          </div>
          <small>También puedes arrastrarme al otro lado.</small>
        </div>
      )}
      <button
        ref={body}
        type="button"
        className="mochi-presence-body"
        aria-label="Mochi: ayuda y opciones"
        aria-expanded={menu}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => (drag.current = null)}
        onClick={toggle}
      >
        <Mascot size={SIZE} mood={jumping ? 'jump' : menu ? 'listen' : 'idle'} />
      </button>
    </div>
  )
}
