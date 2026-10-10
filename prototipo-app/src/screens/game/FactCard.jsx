import { LockSimple } from '@phosphor-icons/react'
import './fact-card.css'

/** La fuente de una tarjeta: abre en una pestaña nueva, para no sacar a la persona de la app. */
export function Source({ source }) {
  return (
    <span className="fact-card-source">
      Fuente:{' '}
      <a href={source.url} target="_blank" rel="noopener noreferrer">
        {source.title}
      </a>
    </span>
  )
}

/** Título corto de una tarjeta para etiquetas: el del dato o, en una pregunta, «Pregunta curiosa». */
export const cardTopic = (card) => (card.kind === 'dato' ? card.title : 'Pregunta curiosa')

/**
 * Tarjeta del álbum: un dato «¿Sabías que…?» o una pregunta curiosa ya acertada (con su respuesta y explicación),
 * siempre con su fuente. Bloqueada muestra solo «?».
 */
export default function FactCard({ fact, locked = false, isNew = false }) {
  const color = `var(--v-${fact.vertical})`
  let body
  if (locked) {
    body = (
      <>
        <LockSimple size={22} aria-hidden="true" />
        <span className="fact-card-topic" aria-hidden="true">
          ?
        </span>
        <span className="muted">Por descubrir</span>
      </>
    )
  } else if (fact.kind === 'dato') {
    body = (
      <>
        <span className="fact-card-kicker">¿Sabías que…?</span>
        <span className="fact-card-topic">{fact.title}</span>
        <span className="fact-card-text">{fact.text}</span>
        <Source source={fact.source} />
      </>
    )
  } else {
    body = (
      <>
        <span className="fact-card-kicker">Pregunta curiosa</span>
        <span className="fact-card-topic">{fact.question}</span>
        <span className="fact-card-text">
          <strong>{fact.options[fact.answer]}.</strong> {fact.explanation}
        </span>
        <Source source={fact.source} />
      </>
    )
  }
  return (
    <div className={`fact-card ${locked ? 'is-locked' : ''} ${isNew ? 'is-new' : ''}`} style={{ '--fact-color': color }}>
      {body}
    </div>
  )
}
