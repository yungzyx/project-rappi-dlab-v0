import { ICONS } from './Stamp.jsx'
import { DATA } from '../game/data.js'
import { useGame } from '../state/GameContext.jsx'
import './map-view.css'

const SIZE = 360
const C = SIZE / 2
const R_VERTICAL = 140
const angleOf = (i) => ((i * 360) / DATA.order.length - 90) * (Math.PI / 180)

// Cada concepto queda en un racimo junto a su vertical típica (la regla de Bigotes y del mapa multivertical):
// filas de 5 puntos que se acercan al centro.
const DOTS = DATA.order.flatMap((v, i) => {
  const base = angleOf(i)
  return DATA.concepts
    .filter((c) => c.home === v)
    .map((c, k) => {
      const r = 108 - Math.floor(k / 5) * 15
      const a = base + (((k % 5) - 2) * 7.5 * Math.PI) / 180
      return { id: c.id, name: c.name, home: v, x: C + r * Math.cos(a), y: C + r * Math.sin(a) }
    })
})

/** Mapa con niebla: los conceptos se encienden cuando los descubres en cualquier vertical. */
export default function MapView() {
  const { state } = useGame()
  const found = new Set(Object.values(state.discovered).flat())

  return (
    <div className="map-view">
      <section className="map-canvas" aria-label="Mapa de verticales">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          {DATA.order.map((v, i) => (
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
                data-concept={d.id}
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
        {DATA.order.map((v, i) => {
          const Icon = ICONS[v]
          const x = ((C + R_VERTICAL * Math.cos(angleOf(i))) / SIZE) * 100
          const y = ((C + R_VERTICAL * Math.sin(angleOf(i))) / SIZE) * 100
          return (
            <span key={v} className="map-vertical" style={{ left: `${x}%`, top: `${y}%`, '--v': `var(--v-${v})` }}>
              <span className="map-vertical-icon">
                <Icon size={18} weight="fill" aria-hidden="true" />
              </span>
              <span className="map-vertical-label">{DATA.labels[v]}</span>
            </span>
          )
        })}
      </section>
      <p className="map-count">
        Descubriste {found.size} de {DATA.concepts.length} conceptos
      </p>
    </div>
  )
}
