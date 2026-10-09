import FactCard from '../components/FactCard.jsx'
import { DATA } from '../game/data.js'
import { FACTS, factsOf } from '../game/facts.js'
import { useGame } from '../state/GameContext.jsx'
import './album.css'

const GROUPS = [
  ...DATA.order.map((v) => ({ id: v, label: DATA.labels[v], facts: factsOf(v) })),
  { id: 'general', label: 'Todo Rappi', facts: factsOf(null) },
]

/** Álbum de cartas «¿Sabías que…?»: bloqueadas, por leer (boca abajo) o leídas. */
export default function Album() {
  const { state, openCard } = useGame()
  const unlocked = new Set(state.cards)
  const opened = new Set(state.opened)

  return (
    <div className="screen album">
      <header className="screen-head">
        <h1>Álbum</h1>
      </header>
      <p className="muted album-count">
        {unlocked.size} de {FACTS.length} cartas
      </p>
      {unlocked.size === 0 && <p className="album-empty">Juega una ronda para ganar tus primeras cartas.</p>}

      {GROUPS.map((g) => (
        <section key={g.id} aria-label={g.label} className="album-group">
          <h2 className="section-title">
            {g.label}{' '}
            <span className="muted album-group-count">
              {g.facts.filter((f) => unlocked.has(f.id)).length}/{g.facts.length}
            </span>
          </h2>
          <ul className="album-grid">
            {g.facts.map((f) => (
              <li key={f.id} className={opened.has(f.id) ? 'album-wide' : undefined}>
                {!unlocked.has(f.id) ? (
                  <FactCard fact={f} locked />
                ) : opened.has(f.id) ? (
                  <FactCard fact={f} onOpen={() => openCard(f.id)} />
                ) : (
                  <button
                    type="button"
                    className="fact-card is-closed"
                    style={{ '--fact-color': f.vertical ? `var(--v-${f.vertical})` : 'var(--rappi-red)' }}
                    aria-label={`Leer carta: ${f.title}`}
                    onClick={() => openCard(f.id)}
                  >
                    <span className="fact-card-kicker">¿Sabías que…?</span>
                    <span className="fact-card-topic">{f.title}</span>
                    <span className="muted">Toca para leer</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
