import { CaretLeft } from '@phosphor-icons/react'
import FactCard from './FactCard.jsx'
import { cardsOf } from '../../game/knowledge.js'
import { LABELS } from '../../game/verticals.js'
import { useGame } from '../../state/GameContext'
import './vertical.css'

/** Las 12 tarjetas de una vertical: las descubiertas con su texto y su fuente; las demás se ganan jugando. */
export default function Vertical({ vertical, back }) {
  const { state } = useGame()
  const cards = cardsOf(vertical)
  const seen = new Set(state.discovered[vertical] ?? [])

  return (
    <div className="game-screen vertical" style={{ '--v': `var(--v-${vertical})` }}>
      <header className="game-screen-head">
        <button type="button" className="icon-button" aria-label="Volver" onClick={back}>
          <CaretLeft size={22} aria-hidden="true" />
        </button>
        <h1>{LABELS[vertical]}</h1>
        {vertical === 'licores' && <span className="age-badge">+18</span>}
      </header>

      <p className="vertical-count">
        {[...seen].filter((id) => cards.some((c) => c.id === id)).length} de {cards.length} datos descubiertos
      </p>

      <ul className="vertical-cards">
        {cards.map((c) => (
          <li key={c.id}>
            <FactCard fact={c} locked={!seen.has(c.id)} />
          </li>
        ))}
      </ul>
    </div>
  )
}
