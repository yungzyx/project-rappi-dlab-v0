import { Crown } from '@phosphor-icons/react'
import Stamp, { LEVEL_NAMES } from '../components/Stamp.jsx'
import { DATA } from '../game/data.js'
import { conoceRappi, verticalLevel } from '../game/progress.js'
import { useGame } from '../state/GameContext.jsx'
import './passport.css'

export default function Passport({ go }) {
  const { state } = useGame()
  const earned = conoceRappi(state)

  return (
    <div className="screen passport">
      <header className="screen-head">
        <h1>Pasaporte</h1>
      </header>

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
            {earned ? 'Llegaste a Conocedor en las 8 verticales.' : 'Llega a Conocedor en las 8 verticales.'}
          </p>
        </div>
      </section>

      <ul className="passport-grid">
        {DATA.order.map((v) => {
          const level = verticalLevel(state, v)
          return (
            <li key={v}>
              <button
                type="button"
                className="passport-entry"
                aria-label={`${DATA.labels[v]}: ${LEVEL_NAMES[level]}`}
                onClick={() => go('vertical', { vertical: v })}
              >
                <Stamp vertical={v} level={level} size={68} />
                <span className="passport-name">
                  {DATA.labels[v]}
                  {v === 'licores' && <span className="passport-age">+18</span>}
                </span>
                <span className="passport-level muted">{LEVEL_NAMES[level]}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
