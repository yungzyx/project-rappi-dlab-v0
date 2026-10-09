import FactCard from '../components/FactCard.jsx'
import Mascot from '../components/Mascot.jsx'
import Stamp, { LEVEL_NAMES } from '../components/Stamp.jsx'
import { DATA } from '../game/data.js'
import { FACTS } from '../game/facts.js'
import { LEVELS } from '../game/progress.js'
import './challenge.css'

export default function Result({
  vertical,
  isCorrect,
  xp,
  bonus,
  cardId,
  explanation,
  answerLabel,
  levelBefore,
  levelAfter,
  back,
  replace,
}) {
  const card = cardId && FACTS.find((f) => f.id === cardId)
  const leveledUp = LEVELS.indexOf(levelAfter) > LEVELS.indexOf(levelBefore)

  return (
    <div className="screen result" style={{ '--v': `var(--v-${vertical})` }}>
      <div className={`result-head ${isCorrect ? 'is-correct' : 'is-wrong'}`}>
        <Mascot size={70} mood={isCorrect ? 'wave' : 'listen'} />
        <h1>{isCorrect ? '¡Correcto!' : 'Casi'}</h1>
        <p className="xp-pop">+{xp - bonus} XP</p>
      </div>

      <div className="card">
        {!isCorrect && <p className="result-answer">La respuesta era {answerLabel}.</p>}
        <p className="result-explanation">{explanation}</p>
      </div>

      {leveledUp && (
        <div className="card result-levelup" role="status">
          <Stamp vertical={vertical} level={levelAfter} size={64} animate />
          <p>
            Nuevo sello: {LEVEL_NAMES[levelAfter]} de {DATA.labels[vertical]}
          </p>
        </div>
      )}

      {bonus > 0 && <p className="result-bonus">Misión del día completa: +{bonus} XP</p>}

      {card && (
        <div className="result-card">
          <FactCard fact={card} isNew />
        </div>
      )}

      <div className="result-actions">
        <button type="button" className="btn btn-primary btn-block" onClick={() => replace('desafio', { vertical })}>
          Otro desafío
        </button>
        <button type="button" className="btn btn-secondary btn-block" onClick={back}>
          Volver a {DATA.labels[vertical]}
        </button>
      </div>
    </div>
  )
}
