import { CaretLeft } from '@phosphor-icons/react'
import { DATA } from '../game/data.js'

export default function Vertical({ vertical, back }) {
  return (
    <div className="screen">
      <header className="screen-head">
        <button type="button" className="icon-button" aria-label="Volver" onClick={back}>
          <CaretLeft size={22} aria-hidden="true" />
        </button>
        <h1>{DATA.labels[vertical]}</h1>
      </header>
    </div>
  )
}
