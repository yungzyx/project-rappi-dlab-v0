import { CaretLeft } from '@phosphor-icons/react'
import { useState } from 'react'
import Mascot from '../components/Mascot.jsx'
import { makeChallenge } from '../game/challenges.js'
import { DATA } from '../game/data.js'
import { verticalLevel } from '../game/progress.js'
import { useGame } from '../state/GameContext.jsx'
import './challenge.css'

const KIND_TITLES = {
  tipico: 'Lo típico',
  combo: 'Arma el combo',
  sustituto: '¿Qué lo reemplaza?',
  imposible: 'La pareja imposible',
  puente: 'Producto puente',
  trivia: 'Trivia',
}

/** Un desafío de 4 opciones; al elegir, se guarda el resultado y se pasa a Resultado. */
export default function Challenge({ vertical, back, replace }) {
  const { state, answer } = useGame()
  // La semilla es cuántos desafíos lleva la vertical, fijada al abrir la pantalla: así el siguiente es otro.
  const [challenge] = useState(() => makeChallenge(vertical, String(state.answered[vertical] ?? 0)))

  const choose = (optionId) => {
    const before = verticalLevel(state, vertical)
    const isCorrect = optionId === challenge.answer
    const result = answer(vertical, isCorrect)
    replace('resultado', {
      vertical,
      isCorrect,
      xp: result.xp,
      bonus: result.bonus,
      cardId: result.card?.id ?? null,
      explanation: challenge.explanation,
      answerLabel: challenge.options.find((o) => o.id === challenge.answer).label,
      levelBefore: before,
      levelAfter: verticalLevel(result.state, vertical),
    })
  }

  return (
    <div className="screen challenge" style={{ '--v': `var(--v-${vertical})` }}>
      <header className="screen-head">
        <button type="button" className="icon-button" aria-label="Volver" onClick={back}>
          <CaretLeft size={22} aria-hidden="true" />
        </button>
        <p className="challenge-where">
          {DATA.labels[vertical]} · {KIND_TITLES[challenge.kind]}
        </p>
      </header>

      <div className="challenge-bubble">
        <Mascot size={58} mood="think" />
        <h1 className="challenge-question">{challenge.question}</h1>
      </div>

      <div className="challenge-options" role="group" aria-label="Opciones">
        {challenge.options.map((o) => (
          <button key={o.id} type="button" className="challenge-option" onClick={() => choose(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
