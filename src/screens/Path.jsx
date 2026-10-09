import { CheckCircle, Gift, Star } from '@phosphor-icons/react'
import { useState } from 'react'
import Hud from '../components/Hud.jsx'
import Mascot from '../components/Mascot.jsx'
import Sheet from '../components/Sheet.jsx'
import Stamp, { ICONS, LEVEL_NAMES } from '../components/Stamp.jsx'
import { DATA, conceptsOf } from '../game/data.js'
import { currentStreak, dailyProgress, nextVertical, verticalLevel } from '../game/progress.js'
import { useGame } from '../state/GameContext.jsx'
import './path.css'

const STARS = { ninguno: 0, explorador: 1, conocedor: 2, experto: 3 }
// Zigzag del camino, en px desde el centro: una serpiente suave como en los juegos de niveles.
const OFFSETS = [0, 70, 92, 46, -24, -78, -60, 6]
const STEP = 124

/** Qué falta para el próximo sello, en una frase corta. */
function nextGoal(level, total, found, correct) {
  const parts = (concepts, hits) =>
    [concepts > 0 && `${concepts} conceptos`, hits > 0 && `${hits} aciertos`].filter(Boolean).join(' y ')
  if (level === 'experto') return 'Sello completo. Ya eres experto aquí.'
  if (level === 'conocedor') return `Para Experto: ${parts(total - found, 8 - correct)} más.`
  if (level === 'explorador') return `Para Conocedor: ${parts(Math.ceil(total / 2) - found, 3 - correct)} más.`
  return 'Juega una ronda para ganar tu primer sello.'
}

function MissionChest({ daily }) {
  const steps = [
    { label: '2 conceptos', done: daily.discovered >= 2 },
    { label: '1 acierto', done: daily.correct >= 1 },
    { label: '1 carta', done: daily.opened >= 1 },
  ]
  const count = steps.filter((s) => s.done).length
  return (
    <section className={`chest ${daily.done ? 'is-open' : ''}`} aria-label="Misión del día">
      <span className="chest-icon">
        <Gift size={30} weight="fill" aria-hidden="true" />
      </span>
      <div className="chest-body">
        <p className="chest-title">
          <span>
            Misión del día <span className="chest-count">{count}/3</span>
          </span>
          <span className="chest-prize">{daily.done ? '¡Listo!' : '+50 XP'}</span>
        </p>
        <ul className="chest-steps">
          {steps.map((s) => (
            <li key={s.label} data-done={String(s.done)} className={s.done ? 'is-done' : ''}>
              {s.done && <CheckCircle size={14} weight="fill" aria-hidden="true" />}
              {s.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** Inicio: el camino de las 8 verticales. Tocar una abre su hoja con «Jugar». */
export default function Path({ go }) {
  const { state, date } = useGame()
  const [open, setOpen] = useState(null)
  const here = nextVertical(state)
  const height = STEP * DATA.order.length

  return (
    <>
      <div className="screen path">
        <Hud
          xp={state.xp}
          streak={currentStreak(state, date)}
          cards={state.cards.length}
          onSettings={() => go('ajustes')}
        />
        <MissionChest daily={dailyProgress(state, date)} />

        <section className="path-track" aria-label="Camino de verticales" style={{ height }}>
          <svg className="path-line" viewBox={`-181 0 362 ${height}`} preserveAspectRatio="none" aria-hidden="true">
            <polyline points={OFFSETS.map((x, i) => `${x},${i * STEP + 46}`).join(' ')} />
          </svg>
          {DATA.order.map((v, i) => {
            const level = verticalLevel(state, v)
            const Icon = ICONS[v]
            const isHere = v === here
            return (
              <div
                key={v}
                className="path-stop"
                style={{ top: i * STEP, '--x': `${OFFSETS[i]}px`, '--v': `var(--v-${v})` }}
                data-vertical={v}
                data-here={String(isHere)}
              >
                {isHere && (
                  <div className={`path-here ${OFFSETS[i] > 0 ? 'is-left' : 'is-right'}`} aria-hidden="true">
                    <Mascot size={52} mood="wave" />
                    <span>¡Aquí!</span>
                  </div>
                )}
                <button
                  type="button"
                  className={`path-node ${isHere ? 'is-here' : ''}`}
                  aria-label={`${DATA.labels[v]}: ${LEVEL_NAMES[level]}`}
                  onClick={() => setOpen(v)}
                >
                  <Icon size={34} weight="fill" aria-hidden="true" />
                </button>
                <span className="path-stars" aria-hidden="true">
                  {[0, 1, 2].map((k) => (
                    <Star key={k} size={15} weight={k < STARS[level] ? 'fill' : 'regular'} />
                  ))}
                </span>
                <span className="path-label">{DATA.labels[v]}</span>
              </div>
            )
          })}
        </section>
      </div>
      {/* Fuera de la pantalla que se desplaza: la hoja cubre siempre el teléfono, aunque el camino esté abajo. */}
      {open && (
        <Sheet label={DATA.labels[open]} onClose={() => setOpen(null)}>
          <VerticalSheet vertical={open} go={go} />
        </Sheet>
      )}
    </>
  )
}

function VerticalSheet({ vertical, go }) {
  const { state } = useGame()
  const level = verticalLevel(state, vertical)
  const total = conceptsOf(vertical).length
  const found = state.discovered[vertical]?.length ?? 0
  const correct = state.correct[vertical] ?? 0

  return (
    <div className="vsheet" style={{ '--v': `var(--v-${vertical})` }}>
      <Stamp vertical={vertical} level={level} size={84} />
      <h2 className="vsheet-title">
        {DATA.labels[vertical]}
        {vertical === 'licores' && <span className="age-badge">+18</span>}
      </h2>
      <p className={`vsheet-level ${level === 'ninguno' ? 'is-none' : ''}`}>{LEVEL_NAMES[level]}</p>
      <p className="vsheet-stats">
        {found} de {total} conceptos · {correct} {correct === 1 ? 'acierto' : 'aciertos'}
      </p>
      <p className="vsheet-goal muted">{nextGoal(level, total, found, correct)}</p>
      <button type="button" className="btn-game" onClick={() => go('ronda', { vertical })}>
        Jugar
      </button>
      <button type="button" className="btn-ghost" onClick={() => go('coleccion', { vertical })}>
        Ver conceptos
      </button>
    </div>
  )
}
