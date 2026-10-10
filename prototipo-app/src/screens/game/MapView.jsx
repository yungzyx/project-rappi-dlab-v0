import { ICONS } from './Stamp.jsx'
import { KNOWLEDGE, cardsOf } from '../../game/knowledge.js'
import { LABELS, PASSPORT_ORDER } from '../../game/verticals.js'
import { useGame } from '../../state/GameContext'
import './map-view.css'

const SIZE = 360
const C = SIZE / 2
const R_VERTICAL = 140
const angleOf = (i) => ((i * 360) / PASSPORT_ORDER.length - 90) * (Math.PI / 180)

// Las 12 tarjetas de cada vertical en un racimo junto a ella: filas de 4 puntos que se acercan al centro.
const DOTS = PASSPORT_ORDER.flatMap((v, i) => {
  const base = angleOf(i)
  return cardsOf(v).map((card, k) => {
    const r = 108 - Math.floor(k / 4) * 15
    const a = base + (((k % 4) - 1.5) * 7 * Math.PI) / 180
    return { id: card.id, home: v, x: C + r * Math.cos(a), y: C + r * Math.sin(a) }
  })
})

/** Mapa con niebla: cada tarjeta se enciende cuando la descubres (un dato visto o una pregunta acertada). */
export default function MapView() {
  const { state } = useGame()
  const found = new Set(Object.values(state.discovered).flat())

  return (
    <div className="map-view">
      <section className="map-canvas" aria-label="Mapa de verticales">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          {PASSPORT_ORDER.map((v, i) => (
            <line
              key={v}
              x1={C}
              y1={C}
              x2={C + R_VERTICAL * Math.cos(angleOf(i))}
              y2={C + R_VERTICAL * Math.sin(angleOf(i))}
              className="map-spoke"
            />
          ))}
          {DOTS.map((d) => {
            const lit = found.has(d.id)
            return (
              <circle
                key={d.id}
                data-card={d.id}
                data-lit={String(lit)}
                cx={d.x}
                cy={d.y}
                r={lit ? 5 : 3.2}
                className={lit ? 'map-dot is-lit' : 'map-dot'}
                style={lit ? { fill: `var(--v-${d.home})` } : undefined}
              />
            )
          })}
        </svg>
        {PASSPORT_ORDER.map((v, i) => {
          const Icon = ICONS[v]
          const x = ((C + R_VERTICAL * Math.cos(angleOf(i))) / SIZE) * 100
          const y = ((C + R_VERTICAL * Math.sin(angleOf(i))) / SIZE) * 100
          return (
            <span key={v} className="map-vertical" style={{ left: `${x}%`, top: `${y}%`, '--v': `var(--v-${v})` }}>
              <span className="map-vertical-icon">
                <Icon size={18} weight="fill" aria-hidden="true" />
              </span>
              <span className="map-vertical-label">{LABELS[v]}</span>
            </span>
          )
        })}
      </section>
      <p className="map-count">
        Descubriste {found.size} de {KNOWLEDGE.length} datos
      </p>
    </div>
  )
}
