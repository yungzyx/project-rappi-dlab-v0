import { LockSimple } from '@phosphor-icons/react'
import { DATA } from '../game/data.js'
import './fact-card.css'

/** Carta «¿Sabías que…?»; bloqueada muestra solo su tema. */
export default function FactCard({ fact, locked = false, isNew = false, onOpen }) {
  const color = fact.vertical ? `var(--v-${fact.vertical})` : 'var(--rappi-red)'
  const body = locked ? (
    <>
      <LockSimple size={22} aria-hidden="true" />
      <span className="fact-card-topic">{fact.title}</span>
      <span className="muted">Por descubrir</span>
    </>
  ) : (
    <>
      <span className="fact-card-kicker">¿Sabías que…?</span>
      <p className="fact-card-text">{fact.text}</p>
      <span className="fact-card-source">
        {fact.vertical ? DATA.labels[fact.vertical] : 'Todo Rappi'} · Catálogo del {DATA.asOf}
      </span>
    </>
  )
  const className = `fact-card ${locked ? 'is-locked' : ''} ${isNew ? 'is-new' : ''}`
  if (onOpen && !locked) {
    return (
      <button type="button" className={className} style={{ '--fact-color': color }} onClick={onOpen}>
        {body}
      </button>
    )
  }
  return (
    <div className={className} style={{ '--fact-color': color }}>
      {body}
    </div>
  )
}
