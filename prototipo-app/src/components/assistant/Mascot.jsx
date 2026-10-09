import { useEffect, useRef, useState } from 'react'
import './mascot.css'

// Cuánto se inclina Mochi hacia el mouse, como si lo mirara.
const LOOK_MAX_DEG = 5

/**
 * Mochi, la mascota del asistente: la mochila Rappi con bigote. Sus 4 poses están en una sola imagen
 * (frontal, feliz, tímido, saltando) y el estado elige cuál se ve.
 * mood: 'idle' | 'wave' | 'listen' | 'think' | 'talk'. `badge` lo pone en un círculo, como un avatar.
 */
export default function Mascot({ size = 56, mood = 'idle', badge = false, className = '' }) {
  const [booping, setBooping] = useState(false)
  const ref = useRef(null)

  // Si el salto se corta (p. ej. Mochi se oculta a mitad), vuelve a su pose en vez de quedar pegado en el salto.
  useEffect(() => {
    const el = ref.current
    const cancel = (event) => event.animationName === 'mochi-boop' && setBooping(false)
    el.addEventListener('animationcancel', cancel)
    return () => el.removeEventListener('animationcancel', cancel)
  }, [])

  const look = (event) => {
    if (event.pointerType !== 'mouse') return
    const box = event.currentTarget.getBoundingClientRect()
    const deg = Math.max(-LOOK_MAX_DEG, Math.min(LOOK_MAX_DEG, (event.clientX - box.left - box.width / 2) / 8))
    event.currentTarget.style.setProperty('--mochi-look', `${deg}deg`)
  }

  const classes = ['mascot', 'mochi', `mascot--${mood}`, badge && 'mochi--badge', booping && 'mochi--boop', className]

  return (
    <span
      ref={ref}
      className={classes.filter(Boolean).join(' ')}
      style={{ width: size, height: size * (badge ? 1 : 1.2) }}
      aria-hidden="true"
      onPointerMove={look}
      onPointerLeave={(event) => event.currentTarget.style.setProperty('--mochi-look', '0deg')}
      onPointerDown={() => setBooping(true)}
      onAnimationEnd={(event) => event.animationName === 'mochi-boop' && setBooping(false)}
    >
      <span className="mochi-shadow" />
      <span className="mochi-body">
        <span className="mochi-sprite" />
      </span>
    </span>
  )
}
