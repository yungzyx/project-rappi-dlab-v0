import { Cards, Fire, GearSix } from '@phosphor-icons/react'
import { explorerLevel } from '../../game/progress.js'
import './hud.css'

/** Barra de juego: nivel con su avance, racha, cartas y ajustes. */
export default function Hud({ xp, streak, cards, onSettings }) {
  const inLevel = xp % 100
  return (
    <header className="hud">
      <div className="hud-level">
        <span className="hud-level-badge" aria-hidden="true">
          {explorerLevel(xp)}
        </span>
        <div className="hud-level-body">
          <span className="hud-level-name">Nivel {explorerLevel(xp)}</span>
          <span
            className="hud-level-bar"
            role="progressbar"
            aria-label="Experiencia del nivel"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={inLevel}
          >
            <span style={{ transform: `scaleX(${inLevel / 100})` }} />
          </span>
        </div>
      </div>
      <span className="hud-stat" aria-label={`Racha de ${streak} ${streak === 1 ? 'día' : 'días'}`}>
        <Fire size={22} weight="fill" className="hud-fire" aria-hidden="true" />
        {streak}
      </span>
      <span className="hud-stat" aria-label={`${cards} cartas`}>
        <Cards size={22} weight="fill" className="hud-cards" aria-hidden="true" />
        {cards}
      </span>
      <button type="button" className="hud-gear" aria-label="Ajustes" onClick={onSettings}>
        <GearSix size={22} weight="bold" aria-hidden="true" />
      </button>
    </header>
  )
}
