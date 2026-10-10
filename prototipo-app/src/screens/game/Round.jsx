import { Star, X } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import FactCard, { Source } from './FactCard.jsx'
import Mascot from '../../components/assistant/Mascot'
import Sheet from './GameSheet.jsx'
import Stamp, { LEVEL_NAMES } from './Stamp.jsx'
import { cardById } from '../../game/knowledge.js'
import { LABELS } from '../../game/verticals.js'
import { LEVELS, explorerLevel, verticalLevel } from '../../game/progress.js'
import { makeRound, roundStars } from '../../game/round.js'
import { useGame } from '../../state/GameContext'
import './round.css'

const KIND_TITLES = {
  tipico: 'Lo típico',
  combo: 'Arma el combo',
  sustituto: 'Si no hay',
  imposible: 'La pareja imposible',
  puente: 'Producto puente',
  trivia: 'Trivia',
  conocimiento: 'Pregunta curiosa',
}

/** Un dato «¿Sabías que…?»: se da vuelta y muestra el dato con su fuente. */
function Dato({ card, outcome, onReveal }) {
  return (
    <div className="step-discover">
      <p className="step-kicker">¿Sabías que…?</p>
      {!outcome ? (
        <button type="button" className="flip-card is-back" aria-label="Dar vuelta" onClick={onReveal}>
          <span className="flip-q" aria-hidden="true">
            ?
          </span>
          <span className="flip-hint">Toca para dar vuelta</span>
        </button>
      ) : (
        <div className="flip-card is-front">
          <h2>{card.title}</h2>
          {outcome.xp > 0 && <p className="xp-pop">+{outcome.xp} XP</p>}
          <p className="flip-fact">{card.text}</p>
          <Source source={card.source} />
        </div>
      )}
    </div>
  )
}

function Ask({ challenge, outcome, onChoose }) {
  return (
    <div className="step-ask">
      <p className="step-kicker">{KIND_TITLES[challenge.kind]}</p>
      <div className="ask-bubble">
        <Mascot size={56} mood={outcome ? (outcome.ok ? 'wave' : 'listen') : 'think'} />
        <h2 className="ask-question">{challenge.question}</h2>
      </div>
      <div className="ask-options" role="group" aria-label="Opciones">
        {challenge.options.map((o) => {
          let state = ''
          if (outcome && o.id === challenge.answer) state = 'is-right'
          else if (outcome && o.id === outcome.selected) state = 'is-wrong'
          return (
            <button
              key={o.id}
              type="button"
              className={`ask-option ${state}`}
              disabled={Boolean(outcome)}
              onClick={() => onChoose(o.id)}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Feedback({ step, outcome, onNext }) {
  if (step.type === 'dato') {
    return (
      <footer className="feedback">
        <button type="button" className="btn-game" onClick={onNext} autoFocus>
          Continuar
        </button>
      </footer>
    )
  }
  const { challenge } = step
  const answer = challenge.options.find((o) => o.id === challenge.answer).label
  return (
    <footer className={`feedback ${outcome.ok ? 'is-good' : 'is-bad'}`} role="status">
      <div className="feedback-head">
        <strong>{outcome.ok ? '¡Correcto!' : 'Casi'}</strong>
        <span className="feedback-xp">+{outcome.xp} XP</span>
      </div>
      {!outcome.ok && <p className="feedback-answer">La respuesta era {answer}.</p>}
      <p className="feedback-text">{challenge.explanation}</p>
      {challenge.source && <Source source={challenge.source} />}
      <button type="button" className={`btn-game ${outcome.ok ? 'is-good' : 'is-bad'}`} onClick={onNext} autoFocus>
        Continuar
      </button>
    </footer>
  )
}

function RoundEnd({ vertical, tally, levelBefore, xpBefore, onDone, doneLabel = 'Seguir' }) {
  const { state, openCard } = useGame()
  const [opened, setOpened] = useState(false)
  const [lateBonus, setLateBonus] = useState(0)
  const stars = roundStars(tally.correct, tally.challenges)
  const levelAfter = verticalLevel(state, vertical)
  const leveledUp = LEVELS.indexOf(levelAfter) > LEVELS.indexOf(levelBefore)
  const [card, ...more] = tally.cards.map(cardById)
  const bonus = tally.bonus + lateBonus
  const newLevel = explorerLevel(state.xp) > explorerLevel(xpBefore) ? explorerLevel(state.xp) : null
  // Barra del nivel: parte donde estaba antes de la ronda (o en cero si subió de nivel) y se llena hasta ahora.
  const from = newLevel ? 0 : (xpBefore % 100) / 100
  const to = (state.xp % 100) / 100

  const open = () => {
    const result = openCard(card.id)
    setLateBonus(result.bonus)
    setOpened(true)
  }

  return (
    <div className="game-screen no-nav round-end" style={{ '--v': `var(--v-${vertical})` }}>
      {stars === 3 && <Confetti />}
      <Mascot size={86} mood="wave" />
      <h1>¡Ronda completa!</h1>
      <div className="end-stars" aria-label={`${stars} de 3 estrellas`}>
        {[0, 1, 2].map((k) => (
          <Star key={k} size={46} weight={k < stars ? 'fill' : 'regular'} className={k < stars ? 'is-on' : ''} />
        ))}
      </div>
      <p className="end-xp">+{tally.xp} XP</p>
      <div className="end-level" aria-label={`Nivel ${explorerLevel(state.xp)}, ${state.xp % 100} de 100 XP`}>
        <span className="end-level-badge" aria-hidden="true">
          {explorerLevel(state.xp)}
        </span>
        <span className="end-level-bar" aria-hidden="true">
          <span style={{ '--from': from, '--to': to }} />
        </span>
      </div>
      {newLevel && <p className="end-newlevel">¡Subiste a nivel {newLevel}!</p>}
      <p className="muted end-hits">
        {tally.correct} de {tally.challenges} aciertos
      </p>

      {leveledUp && (
        <div className="end-levelup" role="status">
          <Stamp vertical={vertical} level={levelAfter} size={64} animate />
          <p>
            Nuevo sello: {LEVEL_NAMES[levelAfter]} de {LABELS[vertical]}
          </p>
        </div>
      )}

      {card && !opened && (
        <button type="button" className="end-card" onClick={open}>
          <span className="end-card-q" aria-hidden="true">
            ?
          </span>
          Abrir carta
        </button>
      )}
      {card && opened && (
        <div className="end-card-open">
          <FactCard fact={card} isNew />
          {more.length > 0 && (
            <p className="muted end-more">
              {more.length === 1 ? 'Y 1 carta más en tu álbum.' : `Y ${more.length} cartas más en tu álbum.`}
            </p>
          )}
        </div>
      )}

      {bonus > 0 && <p className="end-bonus">Misión del día completa: +{bonus} XP</p>}

      <button type="button" className="btn-game end-done" onClick={onDone}>
        {doneLabel}
      </button>
    </div>
  )
}

function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 18 }, (_, i) => (
        <span key={i} style={{ '--i': i }} />
      ))}
    </div>
  )
}

/** Una ronda de 5 pasos en una vertical: dar vuelta datos «¿Sabías que…?» y responder preguntas y un desafío. */
/** `orderId`: se juega mientras llega un pedido; al final se vuelve a él. */
export default function Round({ vertical, back, orderId }) {
  const game = useGame()
  const { clearEvents } = game
  const [steps] = useState(() => makeRound(game.state, vertical))
  const [levelBefore] = useState(() => verticalLevel(game.state, vertical))
  const [xpBefore] = useState(() => game.state.xp)
  const [index, setIndex] = useState(0)
  const [outcome, setOutcome] = useState(null)
  const [confirmExit, setConfirmExit] = useState(false)
  const [tally, setTally] = useState({ xp: 0, bonus: 0, correct: 0, challenges: 0, cards: [] })

  const finished = index >= steps.length
  const step = steps[index]

  const record = (result, extra) =>
    setTally((t) => ({
      ...t,
      xp: t.xp + result.xp - result.bonus,
      bonus: t.bonus + result.bonus,
      ...extra(t),
    }))

  // Lo que entra al álbum en esta ronda (datos vistos por primera vez y preguntas acertadas por primera vez).
  const isNew = (id) => !(game.state.discovered[vertical] ?? []).includes(id)

  const reveal = () => {
    const fresh = isNew(step.card.id)
    const result = game.discover(vertical, step.card.id)
    record(result, (t) => ({ cards: fresh ? [...t.cards, step.card.id] : t.cards }))
    setOutcome({ xp: result.xp - result.bonus })
  }

  const choose = (optionId) => {
    const ok = optionId === step.challenge.answer
    const cardId = step.type === 'pregunta' ? step.challenge.id : undefined
    const learned = ok && cardId && isNew(cardId)
    const result = game.answer(vertical, ok, cardId)
    record(result, (t) => ({
      correct: t.correct + (ok ? 1 : 0),
      challenges: t.challenges + 1,
      cards: learned ? [...t.cards, cardId] : t.cards,
    }))
    setOutcome({ ok, selected: optionId, xp: result.xp - result.bonus })
    // Vibración leve en teléfono; el navegador la rechaza si aún no hubo un toque (no es un error del juego).
    try {
      navigator.vibrate?.(ok ? 12 : [30, 40, 30])
    } catch {
      /* sin vibración */
    }
  }

  const next = () => {
    setOutcome(null)
    setIndex((i) => i + 1)
  }

  // Lo que se logra en la ronda lo celebra su pantalla final: al salir no se repite como aviso.
  useEffect(() => clearEvents, [clearEvents])

  // Teclado para la demo en computador: 1 a 4 responden, Enter o espacio dan vuelta la carta o siguen.
  useEffect(() => {
    if (finished || confirmExit) return undefined
    const onKey = (e) => {
      if (e.repeat) return
      // Enter sobre un enlace (la fuente) lo abre: no sigue la ronda.
      const go = (e.key === 'Enter' || e.key === ' ') && !e.target.closest?.('a')
      if (outcome && go) {
        e.preventDefault()
        next()
      } else if (!outcome && step.type === 'dato' && go) {
        e.preventDefault()
        reveal()
      } else if (!outcome && step.type !== 'dato' && /^[1-4]$/.test(e.key)) {
        const option = step.challenge.options[Number(e.key) - 1]
        if (option) choose(option.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (finished) {
    return (
      <RoundEnd
        vertical={vertical}
        tally={tally}
        levelBefore={levelBefore}
        xpBefore={xpBefore}
        onDone={back}
        doneLabel={orderId ? 'Volver a tu pedido' : 'Seguir'}
      />
    )
  }

  return (
    <div className="game-screen no-nav round" style={{ '--v': `var(--v-${vertical})` }}>
      <header className="round-top">
        <button type="button" className="round-exit" aria-label="Salir" onClick={() => setConfirmExit(true)}>
          <X size={24} weight="bold" aria-hidden="true" />
        </button>
        <div
          className="round-progress"
          role="progressbar"
          aria-label="Avance de la ronda"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={index + (outcome ? 1 : 0)}
        >
          <span style={{ transform: `scaleX(${(index + (outcome ? 1 : 0)) / steps.length})` }} />
        </div>
      </header>

      <div className="round-body" key={index}>
        {step.type === 'dato' ? (
          <Dato card={step.card} outcome={outcome} onReveal={reveal} />
        ) : (
          <Ask challenge={step.challenge} outcome={outcome} onChoose={choose} />
        )}
      </div>

      {outcome && <Feedback step={step} outcome={outcome} onNext={next} />}

      {confirmExit && (
        <Sheet label="¿Salir de la ronda?" onClose={() => setConfirmExit(false)}>
          <div className="exit-sheet">
            <Mascot size={70} mood="listen" />
            <h2>¿Salir de la ronda?</h2>
            <p className="muted">Lo que ganaste hasta ahora queda guardado.</p>
            <button type="button" className="btn-game" onClick={() => setConfirmExit(false)}>
              Seguir jugando
            </button>
            <button type="button" className="btn-ghost" onClick={back}>
              Salir de la ronda
            </button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
