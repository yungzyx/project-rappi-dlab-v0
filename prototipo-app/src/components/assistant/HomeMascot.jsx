import { useEffect, useRef, useState } from 'react'
import { ASSISTANT_NAME } from '../../assistant/brain'
import { rectInPhone, useAssistant } from '../../state/AssistantContext'
import Mascot from './Mascot'
import './home-mascot.css'

const BUBBLE_DELAY_MS = 1200
const BUBBLE_VISIBLE_MS = 3800

// El saludo sale una sola vez por sesión, no cada vez que se vuelve a la Home.
let greeted = false

/** Mascota en la esquina superior derecha de la Home. Tocarla abre el asistente desde su círculo. */
export default function HomeMascot() {
  const assistant = useAssistant()
  const ref = useRef(null)
  const [bubble, setBubble] = useState(false)

  useEffect(() => {
    if (greeted) return undefined
    // La bandera se marca al mostrarlo (no al programarlo): en desarrollo React monta el efecto dos veces.
    const show = setTimeout(() => {
      greeted = true
      setBubble(true)
    }, BUBBLE_DELAY_MS)
    const hide = setTimeout(() => setBubble(false), BUBBLE_DELAY_MS + BUBBLE_VISIBLE_MS)
    return () => {
      clearTimeout(show)
      clearTimeout(hide)
    }
  }, [])

  const open = () => {
    setBubble(false)
    assistant.open({ mode: 'chat', origin: rectInPhone(ref.current) })
  }

  return (
    <div className="home-mascot">
      <button ref={ref} type="button" className="home-mascot-button" aria-label={`Hablar con ${ASSISTANT_NAME}`} onClick={open}>
        <Mascot size={58} badge mood={bubble ? 'wave' : 'idle'} />
      </button>
      <span className={bubble ? 'home-mascot-bubble is-visible' : 'home-mascot-bubble'} aria-hidden={!bubble}>
        {/* En dos líneas para no tapar la dirección */}
        ¡Hola! Soy
        <br />
        {ASSISTANT_NAME} 👋
      </span>
    </div>
  )
}
