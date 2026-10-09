import { Cards, GameController, SealCheck } from '@phosphor-icons/react'
import Mascot from '../../components/assistant/Mascot'
import Sheet from './GameSheet.jsx'
import './intro.css'

const POINTS = [
  { Icon: GameController, text: 'Juega rondas cortas de 5 pasos.' },
  { Icon: SealCheck, text: 'Gana sellos en las 8 verticales de Rappi.' },
  { Icon: Cards, text: 'Colecciona datos curiosos del catálogo.' },
]

/** Bienvenida de la primera vez: qué es el juego en tres frases y un botón para jugar la primera ronda. */
export default function Intro({ onStart, onClose }) {
  return (
    <Sheet label="Bienvenida" onClose={onClose}>
      <div className="intro">
        <Mascot size={96} mood="wave" />
        <h2>¡Hola! Soy Mochi</h2>
        <p className="intro-lede">Te muestro todo lo que hay en Rappi, más allá de lo que ya conoces.</p>
        <ul className="intro-points">
          {POINTS.map(({ Icon, text }) => (
            <li key={text}>
              <span className="intro-icon">
                <Icon size={22} weight="fill" aria-hidden="true" />
              </span>
              {text}
            </li>
          ))}
        </ul>
        <button type="button" className="btn-game" onClick={onStart}>
          Empezar
        </button>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Ver el camino primero
        </button>
      </div>
    </Sheet>
  )
}
