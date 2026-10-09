import { useState } from 'react'
import { formatShortDate, monthLabel } from '../../lib/format.js'
import { niceTicks, scaleLinear } from './geometry.js'
import { Tooltip } from './Tooltip.jsx'
import { useElementWidth } from './useElementWidth.js'

const HEIGHT = 150
const MARGIN = { top: 12, right: 14, bottom: 26, left: 46 }
const MIN_LABEL_GAP = 32
const KEY_STEPS = { ArrowLeft: -1, ArrowRight: 1 }

/** Tramos consecutivos de puntos completos con valor (un null corta la línea). */
function completeRuns(points) {
  const runs = []
  let current = []
  points.forEach((point, index) => {
    if (point.value === null || point.partial) {
      if (current.length) runs.push(current)
      current = []
    } else current.push(index)
  })
  if (current.length) runs.push(current)
  return runs
}

/** Primer punto de cada mes, sin etiquetas que se toquen. */
function monthTicks(points, x) {
  const ticks = []
  points.forEach((point, index) => {
    const month = monthLabel(point.date)
    if (index > 0 && month === monthLabel(points[index - 1].date)) return
    if (ticks.length && x(index) - ticks.at(-1).x < MIN_LABEL_GAP) return
    ticks.push({ index, x: x(index), month })
  })
  return ticks
}

/**
 * Serie semanal de una sola medida. points: [{ date, value, partial }].
 * La semana parcial (en curso) va punteada y con marcador hueco. Flechas ← → recorren las semanas.
 */
export function LineChart({ points, formatValue, formatTick, label, integerTicks = false }) {
  const [ref, width] = useElementWidth()
  const [active, setActive] = useState(null)
  const ticks = niceTicks(Math.max(0, ...points.map((point) => point.value ?? 0)), 4, { integer: integerTicks })
  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 1)
  const baseline = HEIGHT - MARGIN.bottom
  const last = points.length - 1
  const x = (index) => MARGIN.left + (last > 0 ? (index / last) * innerWidth : innerWidth / 2)
  const y = scaleLinear([0, ticks.at(-1)], [baseline, MARGIN.top])
  const at = (index) => `${x(index)},${y(points[index].value)}`

  const runs = completeRuns(points)
  const lastPoint = points[last]
  const beforePartial = lastPoint?.partial && lastPoint.value !== null ? runs.at(-1)?.at(-1) : undefined

  const indexAt = (clientX, element) => {
    const ratio = (clientX - element.getBoundingClientRect().left - MARGIN.left) / innerWidth
    return Math.min(last, Math.max(0, Math.round(ratio * last)))
  }

  const onKeyDown = (event) => {
    const step = KEY_STEPS[event.key]
    if (step) setActive((current) => Math.min(last, Math.max(0, (current ?? last) + step)))
    else if (event.key === 'Home') setActive(0)
    else if (event.key === 'End') setActive(last)
    else return
    event.preventDefault()
  }

  const activePoint = active === null ? null : points[active]

  return (
    <div ref={ref} className="chart line-chart">
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`${label}. Usa las flechas izquierda y derecha para recorrer las semanas.`}
          tabIndex={0}
          onPointerMove={(event) => setActive(indexAt(event.clientX, event.currentTarget))}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(last)}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
        >
          {ticks.map((tick) => (
            <g key={tick} className="axis">
              <line className={tick === 0 ? 'axis-base' : 'grid'} x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} />
              <text x={MARGIN.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
                {formatTick(tick)}
              </text>
            </g>
          ))}
          {monthTicks(points, x).map((tick) => (
            <text key={tick.index} className="axis" x={tick.x} y={HEIGHT - 6} textAnchor={tick.index === 0 ? 'start' : 'middle'}>
              {tick.month}
            </text>
          ))}

          {runs.map((run) => (
            <g key={run[0]}>
              <path
                className="line-area"
                d={`M${x(run[0])},${baseline}L${run.map(at).join('L')}L${x(run.at(-1))},${baseline}Z`}
              />
              <path className="line-path" d={`M${run.map(at).join('L')}`} />
            </g>
          ))}
          {beforePartial !== undefined && <path className="line-path line-path--partial" d={`M${at(beforePartial)}L${at(last)}`} />}
          {lastPoint && lastPoint.value !== null && (
            <circle
              className={lastPoint.partial ? 'line-dot line-dot--hollow' : 'line-dot'}
              cx={x(last)}
              cy={y(lastPoint.value)}
              r="4"
            />
          )}

          {activePoint && (
            <g className="crosshair">
              <line x1={x(active)} x2={x(active)} y1={MARGIN.top} y2={baseline} />
              {activePoint.value !== null && <circle className="line-dot" cx={x(active)} cy={y(activePoint.value)} r="4" />}
            </g>
          )}
        </svg>
      )}
      {activePoint && (
        <Tooltip
          x={x(active)}
          y={activePoint.value === null ? baseline / 2 : y(activePoint.value)}
          containerWidth={width}
          value={activePoint.value === null ? 'sin dato' : formatValue(activePoint.value)}
          label={`Semana del ${formatShortDate(activePoint.date)}${activePoint.partial ? ' (parcial)' : ''}`}
        />
      )}
    </div>
  )
}
