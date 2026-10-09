import { CaretLeft } from '@phosphor-icons/react'
import { DATA, belongs, conceptById, formatNumber, related } from '../game/data.js'
import './concept.css'

function ConceptChips({ title, ids }) {
  if (!ids.length) return null
  return (
    <section aria-label={title}>
      <h2 className="section-title">{title}</h2>
      <ul className="chips">
        {ids.map((id) => {
          const c = conceptById(id)
          return (
            <li key={id}>
              {c.emoji} {c.name}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Ficha de un concepto: dónde está y con qué se relaciona en el grafo. */
export default function Concept({ vertical, id, xp, back }) {
  const c = conceptById(id)
  const rel = related(id)
  const where = DATA.order.filter((v) => belongs(c, v))
  const sorted = (set) => [...set].sort((a, b) => conceptById(a).name.localeCompare(conceptById(b).name, 'es'))
  const unit = vertical === 'restaurantes' ? 'platos' : 'productos'

  return (
    <div className="screen concept" style={{ '--v': `var(--v-${vertical})` }}>
      <header className="screen-head">
        <button type="button" className="icon-button" aria-label="Volver" onClick={back}>
          <CaretLeft size={22} aria-hidden="true" />
        </button>
      </header>

      <div className="concept-hero">
        <span className="concept-hero-emoji" aria-hidden="true">
          {c.emoji}
        </span>
        <h1>{c.name}</h1>
        <p className="muted">{c.group}</p>
        {xp > 0 && <p className="xp-pop">+{xp} XP</p>}
      </div>

      <p className="concept-fact card">
        En {DATA.labels[vertical]} hay {formatNumber(c.items[vertical] ?? 0)} {unit} de {c.name.toLowerCase()}. Bigotes lo
        asocia sobre todo con <strong>{DATA.labels[c.home]}</strong>.
      </p>

      <section aria-label="Dónde está">
        <h2 className="section-title">
          Está en {where.length} {where.length === 1 ? 'vertical' : 'verticales'}
        </h2>
        <ul className="chips">
          {where.map((v) => (
            <li key={v} style={{ '--chip-color': `var(--v-${v})` }} className="chip-vertical">
              {DATA.labels[v]}
            </li>
          ))}
        </ul>
      </section>

      <ConceptChips title="Combina con" ids={sorted(rel.complements)} />
      <ConceptChips title="Si no hay, lo reemplaza" ids={sorted(rel.substitutes)} />
    </div>
  )
}
