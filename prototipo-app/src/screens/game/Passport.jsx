import { Crown } from '@phosphor-icons/react'
import MapView from './MapView.jsx'
import Stamp, { LEVEL_NAMES } from './Stamp.jsx'
import { conoceRappi, verticalLevel } from '../../game/progress.js'
import { LABELS, PASSPORT_ORDER } from '../../game/verticals.js'
import { useGame } from '../../state/GameContext'
import './passport.css'

/** Pasaporte: el mapa con niebla, el sello especial y los 8 sellos. */
export default function Passport({ go }) {
  const { state } = useGame()
  const earned = conoceRappi(state)

  return (
    <div className="game-screen passport">
      <header className="game-screen-head">
        <h1>Pasaporte</h1>
      </header>

      <div className="card passport-map">
        <MapView />
      </div>

      <section
        className={`card passport-special ${earned ? 'is-earned' : ''}`}
        aria-label="Conoce Rappi"
        data-earned={String(earned)}
      >
        <span className="passport-crown">
          <Crown size={30} weight={earned ? 'fill' : 'regular'} aria-hidden="true" />
        </span>
        <div>
          <p className="passport-special-title">Conoce Rappi</p>
          <p className="muted">
            {earned ? 'Llegaste a Conocedor en las 9 verticales.' : 'Llega a Conocedor en las 9 verticales.'}
          </p>
        </div>
      </section>

      <section aria-label="Sellos">
        <ul className="passport-grid">
          {PASSPORT_ORDER.map((v) => {
            const level = verticalLevel(state, v)
            return (
              <li key={v}>
                <button
                  type="button"
                  className="passport-entry"
                  aria-label={`${LABELS[v]}: ${LEVEL_NAMES[level]}`}
                  onClick={() => go('coleccion', { vertical: v })}
                >
                  <Stamp vertical={v} level={level} size={68} />
                  <span className="passport-name">
                    {LABELS[v]}
                    {v === 'licores' && <span className="passport-age">+18</span>}
                  </span>
                  <span className="passport-level muted">{LEVEL_NAMES[level]}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
