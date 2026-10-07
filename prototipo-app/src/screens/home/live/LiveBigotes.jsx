import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import Mascot from '../../../components/assistant/Mascot'
import { rectInPhone } from '../../../state/AssistantContext'

const SIZE = 84 // ancho de la mascota de cuerpo entero (alto = 1,2 × ancho)
const HEIGHT = SIZE * 1.2
const EDGE = 14 // margen derecho
const TOP_LIMIT = 118 // bajo la dirección: nunca tapa la barra de estado
const BOTTOM_RESERVE = 104 // sobre la barra inferior (y la del carrito)
const TYPE_MS = 16 // ms por letra al «hablar»

/** Texto que aparece letra por letra mientras Bigotes habla (sin animación si se pidió reducir movimiento). */
function useTypewriter(text, reduceMotion) {
  // El avance se guarda junto a su texto: un texto nuevo parte de cero sin reiniciar nada a mano.
  const [progress, setProgress] = useState({ text: null, count: 0 })
  useEffect(() => {
    if (!text || reduceMotion) return undefined
    const timer = setInterval(
      () =>
        setProgress((prev) =>
          prev.text === text ? { text, count: Math.min(prev.count + 1, text.length) } : { text, count: 1 },
        ),
      TYPE_MS,
    )
    return () => clearInterval(timer)
  }, [text, reduceMotion])
  if (!text) return { shown: '', done: true }
  if (reduceMotion) return { shown: text, done: true }
  const count = progress.text === text ? progress.count : 0
  return { shown: text.slice(0, count), done: count >= text.length }
}

/**
 * Bigotes de cuerpo entero viviendo en la Home: se para sobre el bloque del que habla (`target`, que `getBlock`
 * convierte en su elemento) o descansa sobre la barra inferior. Habla con un globo y, a veces, ofrece botones; no es un chat. Tocarlo dispara `onPoke`.
 */
const LiveBigotes = forwardRef(function LiveBigotes(
  { say, target, getBlock, entering, away, reduceMotion, onPoke },
  ref,
) {
  const layerRef = useRef(null)
  const [spot, setSpot] = useState(null)
  const [hopKey, setHopKey] = useState(0)
  const lastY = useRef(null)
  const { shown, done } = useTypewriter(say?.text, reduceMotion)

  const place = useCallback(() => {
    const layer = layerRef.current
    if (!layer) return
    const phone = rectInPhone(layer)
    const height = phone.phoneHeight
    const width = phone.phoneWidth
    let y = height - BOTTOM_RESERVE - HEIGHT
    const block = target ? getBlock(target) : null
    if (block) {
      const box = rectInPhone(block)
      const visible = box.top + box.height > TOP_LIMIT && box.top < height - BOTTOM_RESERVE
      // Parado sobre el borde superior del bloque (los zapatos lo pisan), dentro de la pantalla.
      if (visible) y = Math.min(Math.max(box.top - HEIGHT + 16, TOP_LIMIT), height - BOTTOM_RESERVE - HEIGHT)
    }
    const x = width - SIZE - EDGE
    // En la mitad de abajo el globo crece hacia arriba (no tapa la barra inferior).
    const low = y > height / 2
    setSpot((prev) => (prev && Math.abs(prev.x - x) < 1 && Math.abs(prev.y - y) < 1 ? prev : { x, y, low }))
  }, [target, getBlock])

  useLayoutEffect(() => {
    place()
  }, [place, say])

  // Cada vez que cambia de bloque da un salto.
  useEffect(() => {
    if (!spot) return
    if (lastY.current !== null && Math.abs(lastY.current - spot.y) > 30) setHopKey((n) => n + 1)
    lastY.current = spot.y
  }, [spot])

  useEffect(() => {
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [place])

  useImperativeHandle(ref, () => ({ reposition: place }), [place])

  const mood = say ? (done ? (say.mood ?? 'idle') : 'talk') : 'idle'
  const style = spot ? { transform: `translate3d(${spot.x}px, ${spot.y}px, 0)` } : { opacity: 0 }

  return (
    <div ref={layerRef} className="live-layer" aria-live="polite">
      <div
        className={`live-bigotes${entering ? ' is-entering' : ''}${away ? ' is-away' : ''}${spot?.low ? ' is-low' : ''}`}
        style={style}
      >
        {say && !away && (
          <div className="live-bubble" role="status">
            <p>{shown}</p>
            {say.actions?.length > 0 && done && (
              <div className="live-bubble-actions">
                {say.actions.map((action, i) => (
                  <button
                    key={action.label}
                    type="button"
                    className={i === 0 ? 'live-chip is-primary tap' : 'live-chip tap'}
                    onClick={action.onClick}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          className="live-bigotes-body"
          aria-label="Bigotes: tócalo y te muestra algo nuevo"
          hidden={away}
          onClick={onPoke}
        >
          <span key={hopKey} className={hopKey ? 'live-hop' : undefined}>
            <Mascot size={SIZE} mood={mood} />
          </span>
        </button>
      </div>
    </div>
  )
})

export default LiveBigotes
