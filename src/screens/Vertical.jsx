import { CaretLeft } from '@phosphor-icons/react'
import { DATA, conceptsOf } from '../game/data.js'
import { useGame } from '../state/GameContext.jsx'
import './vertical.css'

/** Colección de conceptos de una vertical: los descubiertos abren su ficha; los demás se ganan jugando. */
export default function Vertical({ vertical, back, go }) {
  const { state } = useGame()
  const concepts = conceptsOf(vertical)
  const seen = new Set(state.discovered[vertical] ?? [])

  return (
    <div className="screen vertical" style={{ '--v': `var(--v-${vertical})` }}>
      <header className="screen-head">
        <button type="button" className="icon-button" aria-label="Volver" onClick={back}>
          <CaretLeft size={22} aria-hidden="true" />
        </button>
        <h1>{DATA.labels[vertical]}</h1>
        {vertical === 'licores' && <span className="age-badge">+18</span>}
      </header>

      <p className="vertical-count">
        <strong>
          {seen.size} de {concepts.length}
        </strong>{' '}
        conceptos descubiertos
      </p>

      <ul className="concept-grid">
        {concepts.map((c) => (
          <li key={c.id}>
            {seen.has(c.id) ? (
              <button
                type="button"
                className="concept-tile is-found"
                aria-label={`${c.emoji} ${c.name}`}
                onClick={() => go('concepto', { vertical, id: c.id })}
              >
                <span className="concept-emoji" aria-hidden="true">
                  {c.emoji}
                </span>
                <span className="concept-name" aria-hidden="true">
                  {c.name}
                </span>
              </button>
            ) : (
              <span className="concept-tile">?</span>
            )}
          </li>
        ))}
      </ul>

      <div className="vertical-play">
        <button type="button" className="btn-game" onClick={() => go('ronda', { vertical })}>
          Jugar
        </button>
      </div>
    </div>
  )
}
