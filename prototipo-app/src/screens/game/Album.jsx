import FactCard, { cardTopic } from './FactCard.jsx'
import { KNOWLEDGE, cardsOf } from '../../game/knowledge.js'
import { LABELS, PASSPORT_ORDER } from '../../game/verticals.js'
import { useGame } from '../../state/GameContext'
import './album.css'

/** Álbum: las tarjetas de cada vertical, por descubrir («?»), por leer (boca abajo) o leídas, con su fuente. */
export default function Album() {
  const { state, openCard } = useGame()
  const unlocked = new Set(state.cards)
  const opened = new Set(state.opened)

  return (
    <div className="game-screen album">
      <header className="game-screen-head">
        <h1>Álbum</h1>
      </header>
      <p className="muted album-count">
        {unlocked.size} de {KNOWLEDGE.length} datos
      </p>
      {unlocked.size === 0 && <p className="album-empty">Juega una ronda para ganar tus primeras tarjetas.</p>}

      {PASSPORT_ORDER.map((v) => {
        const cards = cardsOf(v)
        return (
          <section key={v} aria-label={LABELS[v]} className="album-group">
            <h2 className="section-title">
              {LABELS[v]}{' '}
              <span className="muted album-group-count">
                {cards.filter((c) => unlocked.has(c.id)).length}/{cards.length}
              </span>
            </h2>
            <ul className="album-grid">
              {cards.map((c) => (
                <li key={c.id} className={opened.has(c.id) ? 'album-wide' : undefined}>
                  {!unlocked.has(c.id) ? (
                    <FactCard fact={c} locked />
                  ) : opened.has(c.id) ? (
                    <FactCard fact={c} />
                  ) : (
                    <button
                      type="button"
                      className="fact-card is-closed"
                      style={{ '--fact-color': `var(--v-${c.vertical})` }}
                      aria-label={`Leer tarjeta: ${cardTopic(c)}`}
                      onClick={() => openCard(c.id)}
                    >
                      <span className="fact-card-kicker">{c.kind === 'dato' ? '¿Sabías que…?' : 'Pregunta curiosa'}</span>
                      <span className="fact-card-topic">{cardTopic(c)}</span>
                      <span className="muted">Toca para leer</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
