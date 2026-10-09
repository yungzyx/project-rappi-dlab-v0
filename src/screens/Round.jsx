import { Star, X } from '@phosphor-icons/react'
import { useState } from 'react'
import FactCard from '../components/FactCard.jsx'
import Mascot from '../components/Mascot.jsx'
import Stamp, { LEVEL_NAMES } from '../components/Stamp.jsx'
import { DATA, belongs, conceptById, related } from '../game/data.js'
import { FACTS } from '../game/facts.js'
import { LEVELS, verticalLevel } from '../game/progress.js'
import { makeRound, roundStars } from '../game/round.js'
import { useGame } from '../state/GameContext.jsx'
import './round.css'

const KIND_TITLES = {
  tipico: 'Lo típico',
  combo: 'Arma el combo',
  sustituto: 'Si no hay',
  imposible: 'La pareja imposible',
  puente: 'Producto puente',
  trivia: 'Trivia',
}

function Discover({ concept, outcome, onReveal }) {
  const where = DATA.order.filter((v) => belongs(concept, v))
  const combos = [...related(concept.id).complements].slice(0, 3).map(conceptById)
  return (
    <div className="step-discover">
      <p className="step-kicker">Concepto nuevo</p>
      {!outcome ? (
        <button type="button" className="flip-card is-back" aria-label="Dar vuelta" onClick={onReveal}>
          <span className="flip-q" aria-hidden="true">
            ?
          </span>
          <span className="flip-hint">Toca para dar vuelta</span>
        </button>
      ) : (
        <div className="flip-card is-front">
          <span className="flip-emoji" aria-hidden="true">
            {concept.emoji}
          </span>
          <h2>{concept.name}</h2>
          {outcome.xp > 0 && <p className="xp-pop">+{outcome.xp} XP</p>}
          <p className="flip-fact">
            Está en {where.length} {where.length === 1 ? 'vertical' : 'verticales'}, sobre todo en{' '}
            <strong>{DATA.labels[concept.home]}</strong>.
          </p>
          {combos.length > 0 && (
            <p className="flip-fact">Combina con {combos.map((c) => `${c.emoji} ${c.name}`).join(', ')}.</p>
          )}
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
  if (step.type === 'descubrir') {
    return (
      <footer className="feedback">
        <button type="button" className="btn-game" onClick={onNext}>
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
      <button type="button" className={`btn-game ${outcome.ok ? 'is-good' : 'is-bad'}`} onClick={onNext}>
        Continuar
      </button>
    </footer>
  )
}

function RoundEnd({ vertical, tally, levelBefore, onDone }) {
  const { state, openCard } = useGame()
  const [opened, setOpened] = useState(false)
  const [lateBonus, setLateBonus] = useState(0)
  const stars = roundStars(tally.correct, tally.challenges)
  const levelAfter = verticalLevel(state, vertical)
  const leveledUp = LEVELS.indexOf(levelAfter) > LEVELS.indexOf(levelBefore)
  const [card, ...more] = tally.cards.map((id) => FACTS.find((f) => f.id === id))
  const bonus = tally.bonus + lateBonus

  const open = () => {
    const result = openCard(card.id)
    setLateBonus(result.bonus)
    setOpened(true)
  }

  return (
    <div className="screen no-nav round-end" style={{ '--v': `var(--v-${vertical})` }}>
      {stars === 3 && <Confetti />}
      <Mascot size={86} mood="wave" />
      <h1>¡Ronda completa!</h1>
      <div className="end-stars" aria-label={`${stars} de 3 estrellas`}>
        {[0, 1, 2].map((k) => (
          <Star key={k} size={46} weight={k < stars ? 'fill' : 'regular'} className={k < stars ? 'is-on' : ''} />
        ))}
      </div>
      <p className="end-xp">+{tally.xp} XP</p>
      <p className="muted end-hits">
        {tally.correct} de {tally.challenges} aciertos
      </p>

      {leveledUp && (
        <div className="end-levelup" role="status">
          <Stamp vertical={vertical} level={levelAfter} size={64} animate />
          <p>
            Nuevo sello: {LEVEL_NAMES[levelAfter]} de {DATA.labels[vertical]}
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
        Seguir
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

/** Una ronda de 5 pasos en una vertical: dar vuelta conceptos nuevos y responder desafíos. */
export default function Round({ vertical, back }) {
  const game = useGame()
  const [steps] = useState(() => makeRound(game.state, vertical))
  const [levelBefore] = useState(() => verticalLevel(game.state, vertical))
  const [index, setIndex] = useState(0)
  const [outcome, setOutcome] = useState(null)
  const [tally, setTally] = useState({ xp: 0, bonus: 0, correct: 0, challenges: 0, cards: [] })

  if (index >= steps.length) {
    return <RoundEnd vertical={vertical} tally={tally} levelBefore={levelBefore} onDone={back} />
  }
  const step = steps[index]

  const record = (result, extra) =>
    setTally((t) => ({
      ...t,
      xp: t.xp + result.xp - result.bonus,
      bonus: t.bonus + result.bonus,
      ...extra(t),
    }))

  const reveal = () => {
    const result = game.discover(vertical, step.concept.id)
    record(result, () => ({}))
    setOutcome({ xp: result.xp - result.bonus })
  }

  const choose = (optionId) => {
    const ok = optionId === step.challenge.answer
    const result = game.answer(vertical, ok)
    record(result, (t) => ({
      correct: t.correct + (ok ? 1 : 0),
      challenges: t.challenges + 1,
      cards: result.card ? [...t.cards, result.card.id] : t.cards,
    }))
    setOutcome({ ok, selected: optionId, xp: result.xp - result.bonus })
  }

  const next = () => {
    setOutcome(null)
    setIndex((i) => i + 1)
  }

  return (
    <div className="screen no-nav round" style={{ '--v': `var(--v-${vertical})` }}>
      <header className="round-top">
        <button type="button" className="round-exit" aria-label="Salir" onClick={back}>
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
        {step.type === 'descubrir' ? (
          <Discover concept={step.concept} outcome={outcome} onReveal={reveal} />
        ) : (
          <Ask challenge={step.challenge} outcome={outcome} onChoose={choose} />
        )}
      </div>

      {outcome && <Feedback step={step} outcome={outcome} onNext={next} />}
    </div>
  )
}
