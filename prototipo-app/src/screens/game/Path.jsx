import { CheckCircle, Circle, Gift, Star } from '@phosphor-icons/react'
import { useContext, useState } from 'react'
import Hud from './Hud.jsx'
import Mascot from '../../components/assistant/Mascot'
import Sheet from './GameSheet.jsx'
import Stamp, { ICONS, LEVEL_NAMES } from './Stamp.jsx'
import { cardsOf } from '../../game/knowledge.js'
import { currentStreak, dailyProgress, nextVertical, verticalLevel } from '../../game/progress.js'
import { LABELS, PASSPORT_ORDER } from '../../game/verticals.js'
import { useGame } from '../../state/GameContext'
import { GameShellContext } from './gameShell'
import './path.css'

const STARS = { ninguno: 0, explorador: 1, conocedor: 2, experto: 3 }
// Zigzag del camino, en px desde el centro: una serpiente suave como en los juegos de niveles.
const OFFSETS = [0, 70, 92, 46, -24, -78, -60, 6, 64]
const STEP = 150

/** Qué falta para el próximo sello, en una frase corta. */
function nextGoal(level, total, found, correct) {
  const parts = (cards, hits) =>
    [cards > 0 && `${cards} datos`, hits > 0 && `${hits} aciertos`].filter(Boolean).join(' y ')
  if (level === 'experto') return 'Sello completo. Ya eres experto aquí.'
  if (level === 'conocedor') return `Para Experto: ${parts(total - found, 8 - correct)} más.`
  if (level === 'explorador') return `Para Conocedor: ${parts(Math.ceil(total / 2) - found, 3 - correct)} más.`
  return 'Juega una ronda para ganar tu primer sello.'
}

const missionSteps = (daily) => [
  { label: '2 datos', long: 'Descubre 2 datos nuevos', value: Math.min(daily.discovered, 2), goal: 2 },
  { label: '1 acierto', long: 'Acierta 1 desafío', value: Math.min(daily.correct, 1), goal: 1 },
  { label: '1 carta', long: 'Abre 1 carta del álbum', value: Math.min(daily.opened, 1), goal: 1 },
]

/** El cofre de la misión del día: se toca para ver qué falta. */
function MissionChest({ daily, onOpen }) {
  const steps = missionSteps(daily)
  const count = steps.filter((s) => s.value >= s.goal).length
  return (
    <button
      type="button"
      className={`chest ${daily.done ? 'is-open' : ''}`}
      aria-label={`Misión del día: ${count} de 3`}
      onClick={onOpen}
    >
      <span className="chest-icon">
        <Gift size={30} weight="fill" aria-hidden="true" />
      </span>
      <span className="chest-body">
        <span className="chest-title">
          <span>
            Misión del día <span className="chest-count">{count}/3</span>
          </span>
          <span className="chest-prize">{daily.done ? '¡Listo!' : '+50 XP'}</span>
        </span>
        <span className="chest-steps">
          {steps.map((s) => {
            const done = s.value >= s.goal
            return (
              <span key={s.label} data-done={String(done)} className={done ? 'is-done' : ''}>
                {done && <CheckCircle size={14} weight="fill" aria-hidden="true" />}
                {s.label}
              </span>
            )
          })}
        </span>
      </span>
    </button>
  )
}

function MissionSheet({ daily, streak, onPlay }) {
  const steps = missionSteps(daily)
  return (
    <div className="msheet">
      <span className={`chest-icon chest-icon--big ${daily.done ? 'is-open' : ''}`}>
        <Gift size={44} weight="fill" aria-hidden="true" />
      </span>
      <h2>Misión del día</h2>
      <p className="muted">
        {daily.done
          ? `¡Lista por hoy! Tu racha va en ${streak} ${streak === 1 ? 'día' : 'días'}. Vuelve mañana por otra.`
          : 'Cúmplela en cualquier vertical para ganar 50 XP y sumar un día a tu racha. Una ronda casi alcanza.'}
      </p>
      <ul className="msheet-steps">
        {steps.map((s) => {
          const done = s.value >= s.goal
          return (
            <li key={s.label} className={done ? 'is-done' : ''}>
              {done ? (
                <CheckCircle size={24} weight="fill" aria-hidden="true" />
              ) : (
                <Circle size={24} aria-hidden="true" />
              )}
              <span>{s.long}</span>
              <span className="msheet-count">
                {s.value}/{s.goal}
              </span>
            </li>
          )
        })}
      </ul>
      <button type="button" className="btn-game" data-autofocus onClick={onPlay}>
        Jugar ahora
      </button>
    </div>
  )
}

/** Inicio: el camino de las 9 verticales. Tocar una abre su hoja con «Jugar». */
export default function Path({ go, open: openAtStart = null }) {
  const { state, date } = useGame()
  const [open, setOpen] = useState(openAtStart)
  const here = nextVertical(state)
  const height = STEP * PASSPORT_ORDER.length
  const daily = dailyProgress(state, date)
  const streak = currentStreak(state, date)

  return (
    <>
      <div className="game-screen path">
        <Hud xp={state.xp} streak={streak} cards={state.cards.length} onSettings={() => go('ajustes')} />
        <MissionChest daily={daily} onOpen={() => setOpen('mision')} />

        <section className="path-track" aria-label="Camino de verticales" style={{ height }}>
          <svg className="path-line" viewBox={`-181 0 362 ${height}`} preserveAspectRatio="none" aria-hidden="true">
            <polyline points={OFFSETS.map((x, i) => `${x},${i * STEP + 54}`).join(' ')} />
          </svg>
          {PASSPORT_ORDER.map((v, i) => {
            const level = verticalLevel(state, v)
            const Icon = ICONS[v]
            const isHere = v === here
            const total = cardsOf(v).length // 0 si la base no tiene sus tarjetas: el anillo queda vacío, no NaN
            const progress = total ? (state.discovered[v]?.length ?? 0) / total : 0
            return (
              <div
                key={v}
                className="path-stop"
                style={{ top: i * STEP, '--x': `${OFFSETS[i]}px`, '--v': `var(--v-${v})` }}
                data-vertical={v}
                data-here={String(isHere)}
                data-progress={progress}
              >
                {isHere && (
                  <div className={`path-here ${OFFSETS[i] > 0 ? 'is-left' : 'is-right'}`} aria-hidden="true">
                    <Mascot size={52} mood="wave" />
                    <span className="path-here-label">¡Aquí!</span>
                  </div>
                )}
                <span className="path-node-wrap">
                  {/* Anillo de avance: tarjetas descubiertas sobre el total de la vertical. */}
                  <svg className="path-ring" viewBox="0 0 108 108" aria-hidden="true">
                    <circle className="path-ring-track" cx="54" cy="54" r="50" />
                    <circle
                      className={`path-ring-fill ${level === 'experto' ? 'is-gold' : ''}`}
                      cx="54"
                      cy="54"
                      r="50"
                      pathLength="100"
                      strokeDasharray={`${progress * 100} 100`}
                    />
                  </svg>
                  <button
                    type="button"
                    className={`path-node ${isHere ? 'is-here' : ''}`}
                    aria-label={`${LABELS[v]}: ${LEVEL_NAMES[level]}`}
                    onClick={() => setOpen(v)}
                  >
                    <Icon size={34} weight="fill" aria-hidden="true" />
                  </button>
                </span>
                <span className="path-stars" aria-hidden="true">
                  {[0, 1, 2].map((k) => (
                    <Star key={k} size={15} weight={k < STARS[level] ? 'fill' : 'regular'} />
                  ))}
                </span>
                <span className="path-label">{LABELS[v]}</span>
              </div>
            )
          })}
        </section>
      </div>
      {/* Fuera de la pantalla que se desplaza: la hoja cubre siempre el teléfono, aunque el camino esté abajo. */}
      {open === 'mision' && (
        <Sheet label="Misión del día" onClose={() => setOpen(null)}>
          <MissionSheet daily={daily} streak={streak} onPlay={() => go('ronda', { vertical: here })} />
        </Sheet>
      )}
      {open && open !== 'mision' && (
        <Sheet label={LABELS[open]} onClose={() => setOpen(null)}>
          <VerticalSheet vertical={open} go={go} close={() => setOpen(null)} />
        </Sheet>
      )}
    </>
  )
}

function VerticalSheet({ vertical, go, close }) {
  const { state } = useGame()
  const shell = useContext(GameShellContext)
  const level = verticalLevel(state, vertical)
  const total = cardsOf(vertical).length
  const found = state.discovered[vertical]?.length ?? 0
  const correct = state.correct[vertical] ?? 0

  return (
    <div className="vsheet" style={{ '--v': `var(--v-${vertical})` }}>
      <Stamp vertical={vertical} level={level} size={84} />
      <h2 className="vsheet-title">
        {LABELS[vertical]}
        {vertical === 'licores' && <span className="age-badge">+18</span>}
      </h2>
      <p className={`vsheet-level ${level === 'ninguno' ? 'is-none' : ''}`}>{LEVEL_NAMES[level]}</p>
      <p className="vsheet-stats">
        {found} de {total} datos · {correct} {correct === 1 ? 'acierto' : 'aciertos'}
      </p>
      <p className="vsheet-goal muted">{nextGoal(level, total, found, correct)}</p>
      <button type="button" className="btn-game" data-autofocus onClick={() => go('ronda', { vertical })}>
        Jugar
      </button>
      <button type="button" className="btn-ghost" onClick={() => go('coleccion', { vertical })}>
        Ver datos
      </button>
      {shell?.openInApp && (
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            close() // la hoja no se queda abierta bajo la pantalla que se apila
            shell.openInApp(vertical)
          }}
        >
          Abrir {LABELS[vertical]}
        </button>
      )}
    </div>
  )
}
