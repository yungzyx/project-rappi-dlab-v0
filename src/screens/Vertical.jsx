import { CaretLeft, Question } from '@phosphor-icons/react'
import Stamp, { LEVEL_NAMES } from '../components/Stamp.jsx'
import { DATA, conceptsOf } from '../game/data.js'
import { verticalLevel } from '../game/progress.js'
import { useGame } from '../state/GameContext.jsx'
import './vertical.css'

/** Qué falta para el próximo nivel, en una frase. */
function nextGoal(level, total, found, correct) {
  const half = Math.ceil(total / 2)
  if (level === 'experto') return 'Nivel máximo. Ya conoces esta vertical de punta a punta.'
  if (level === 'conocedor') {
    return `Para Experto: ${Math.max(0, total - found)} conceptos más y ${Math.max(0, 8 - correct)} desafíos acertados más.`
  }
  if (level === 'explorador') {
    return `Para Conocedor: ${Math.max(0, half - found)} conceptos más y ${Math.max(0, 3 - correct)} desafíos acertados más.`
  }
  return 'Descubre tu primer concepto para ganar el sello.'
}

export default function Vertical({ vertical, back, go }) {
  const { state, discover } = useGame()
  const concepts = conceptsOf(vertical)
  const seen = new Set(state.discovered[vertical] ?? [])
  const correct = state.correct[vertical] ?? 0
  const level = verticalLevel(state, vertical)

  const open = (concept) => {
    const { xp } = discover(vertical, concept.id)
    go('concepto', { vertical, id: concept.id, xp })
  }

  return (
    <div className="screen vertical" style={{ '--v': `var(--v-${vertical})` }}>
      <header className="screen-head">
        <button type="button" className="icon-button" aria-label="Volver" onClick={back}>
          <CaretLeft size={22} aria-hidden="true" />
        </button>
        <h1>{DATA.labels[vertical]}</h1>
        {vertical === 'licores' && (
          <span className="age-badge" title="Solo para mayores de 18 años">
            +18
          </span>
        )}
      </header>

      <section className="vertical-summary card">
        <Stamp vertical={vertical} level={level} size={76} />
        <div>
          <p className={`vertical-level ${level === 'ninguno' ? 'is-none' : ''}`}>{LEVEL_NAMES[level]}</p>
          <p className="vertical-counts">
            {seen.size} de {concepts.length} conceptos · {correct}{' '}
            {correct === 1 ? 'desafío acertado' : 'desafíos acertados'}
          </p>
          <p className="vertical-goal muted">{nextGoal(level, concepts.length, seen.size, correct)}</p>
        </div>
      </section>

      <button
        type="button"
        className="btn btn-primary btn-block vertical-challenge"
        onClick={() => go('desafio', { vertical })}
      >
        Desafío
      </button>

      <h2 className="section-title">Conceptos de {DATA.labels[vertical]}</h2>
      <p className="muted vertical-hint">Toca uno para descubrirlo. Los ordenamos por cuántos productos tienen aquí.</p>
      <ul className="concept-grid">
        {concepts.map((c) => (
          <li key={c.id}>
            {seen.has(c.id) ? (
              <button
                type="button"
                className="concept-tile is-found"
                aria-label={`${c.emoji} ${c.name}`}
                onClick={() => open(c)}
              >
                <span className="concept-emoji" aria-hidden="true">
                  {c.emoji}
                </span>
                <span className="concept-name" aria-hidden="true">
                  {c.name}
                </span>
              </button>
            ) : (
              <button type="button" className="concept-tile" aria-label="Descubrir un concepto" onClick={() => open(c)}>
                <Question size={26} weight="bold" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
