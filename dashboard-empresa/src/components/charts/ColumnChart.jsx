import { useState } from 'react'
import { columnPath, scaleLinear } from './geometry.js'
import { Tooltip } from './Tooltip.jsx'
import { useElementWidth } from './useElementWidth.js'

const HEIGHT = 210
const MARGIN = { top: 24, bottom: 30 }
const MAX_BAR = 24

/**
 * Columnas de una sola serie con el valor sobre cada una (sin eje Y: todo va rotulado).
 * data: [{ key, label, value }]. Cada columna es enfocable; `describe(item)` es el texto que acompaña al valor.
 */
export function ColumnChart({ data, formatValue, describe, label }) {
  const [ref, width] = useElementWidth()
  const [active, setActive] = useState(null)
  const max = Math.max(1, ...data.map((item) => item.value))
  const baseline = HEIGHT - MARGIN.bottom
  const y = scaleLinear([0, max], [baseline, MARGIN.top])
  const band = width / Math.max(data.length, 1)
  const barWidth = Math.min(MAX_BAR, band * 0.5)
  const center = (index) => band * index + band / 2
  const activeItem = active === null ? null : data[active]

  return (
    <div ref={ref} className="chart column-chart">
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="group" aria-label={label}>
          <line className="axis-base" x1={0} x2={width} y1={baseline} y2={baseline} />
          {data.map((item, index) => (
            <g
              key={item.key}
              className={active === index ? 'column is-active' : 'column'}
              tabIndex={0}
              role="img"
              aria-label={`${formatValue(item.value)} ${describe(item)}`}
              onPointerEnter={() => setActive(index)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
            >
              <rect className="hit" x={band * index} y={0} width={band} height={HEIGHT} />
              <path className="column-bar" d={columnPath(center(index) - barWidth / 2, barWidth, baseline, y(item.value))} />
              <text className="value-label num" x={center(index)} y={y(item.value) - 8} textAnchor="middle">
                {formatValue(item.value)}
              </text>
              <text className="axis" x={center(index)} y={HEIGHT - 8} textAnchor="middle">
                {item.label}
              </text>
            </g>
          ))}
        </svg>
      )}
      {activeItem && (
        <Tooltip
          x={center(active)}
          y={y(activeItem.value)}
          containerWidth={width}
          value={formatValue(activeItem.value)}
          label={describe(activeItem)}
        />
      )}
    </div>
  )
}
