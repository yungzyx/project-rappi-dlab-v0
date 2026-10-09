import { ArrowRight, CheckCircle, Circle, Fire, GearSix } from '@phosphor-icons/react'
import Mascot from '../components/Mascot.jsx'
import XpBar from '../components/XpBar.jsx'
import { DATA } from '../game/data.js'
import {
  currentStreak,
  dailyProgress,
  dailyVertical,
  explorerLevel,
  nextVertical,
  verticalLevel,
} from '../game/progress.js'
import { useGame } from '../state/GameContext.jsx'
import './home.css'

export default function Home({ go }) {
  const { state, date } = useGame()
  const daily = dailyProgress(state, date)
  const featured = dailyVertical(date)
  const streak = currentStreak(state, date)
  const stamps = DATA.order.filter((v) => verticalLevel(state, v) !== 'ninguno').length
  const steps = [
    { label: 'Descubre 2 conceptos', value: Math.min(daily.discovered, 2), goal: 2 },
    { label: 'Acierta 1 desafío', value: Math.min(daily.correct, 1), goal: 1 },
    { label: 'Abre 1 carta del álbum', value: Math.min(daily.opened, 1), goal: 1 },
  ]

  return (
    <div className="screen home">
      <header className="screen-head">
        <p className="home-app">Juego de verticales</p>
        <button type="button" className="icon-button" aria-label="Ajustes" onClick={() => go('ajustes')}>
          <GearSix size={22} aria-hidden="true" />
        </button>
      </header>

      <section className="home-hero">
        <Mascot size={78} mood="wave" />
        <div>
          <p className="home-greeting">Soy Bigotes. Te muestro todo lo que hay en Rappi, una vertical a la vez.</p>
        </div>
      </section>

      <section className="home-level card" aria-label="Tu nivel">
        <div className="home-level-row">
          <strong className="home-level-number">Nivel {explorerLevel(state.xp)}</strong>
          <span className="muted">{state.xp} XP</span>
        </div>
        <XpBar xp={state.xp} />
        <div className="home-level-row home-level-meta">
          <span>
            <Fire size={18} weight="fill" aria-hidden="true" className="home-fire" /> Racha: {streak}{' '}
            {streak === 1 ? 'día' : 'días'}
          </span>
          <span>Sellos: {stamps} de 8</span>
        </div>
      </section>

      <section className="home-mission card" aria-label="Misión del día">
        <h2>Misión del día</h2>
        <p className="muted">
          Hoy destacamos <strong className="home-featured">{DATA.labels[featured]}</strong>. Completa los 3 pasos en
          cualquier vertical y gana 50 XP extra.
        </p>
        <ul>
          {steps.map((s) => {
            const done = s.value >= s.goal
            return (
              <li key={s.label} data-done={String(done)} className={done ? 'is-done' : ''}>
                {done ? (
                  <CheckCircle size={22} weight="fill" aria-hidden="true" />
                ) : (
                  <Circle size={22} aria-hidden="true" />
                )}
                <span>{s.label}</span>
                <span className="home-step-count">
                  {s.value}/{s.goal}
                </span>
              </li>
            )
          })}
        </ul>
        {daily.done && <p className="home-mission-done">Misión completa. Vuelve mañana para seguir tu racha.</p>}
        <button type="button" className="btn btn-secondary btn-block" onClick={() => go('vertical', { vertical: featured })}>
          Ir a {DATA.labels[featured]}
        </button>
      </section>

      <button
        type="button"
        className="btn btn-primary btn-block home-continue"
        onClick={() => go('vertical', { vertical: nextVertical(state) })}
      >
        Seguir explorando
        <ArrowRight size={20} weight="bold" aria-hidden="true" />
      </button>
    </div>
  )
}
