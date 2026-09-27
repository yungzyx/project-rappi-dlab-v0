import { useState } from 'react'
import { Tooltip } from './Tooltip.jsx'
import { useElementWidth } from './useElementWidth.js'

const LABEL_WIDTH = 56
const COUNT_WIDTH = 38
const HEADER = 24
const ROW = 26
const GAP = 2

/**
 * Mapa de calor con el valor impreso en cada celda (escala secuencial de un solo azul).
 * rows: [{ key, label, count, cells: [valor | null], muted }] · columns: [{ key, label }]
 * bin(valor) → 1..6 elige el tono; las `neutralColumns` van sin escala (p. ej. la semana 0, que siempre es 100%).
 * formatCell: texto corto dentro de la celda; formatValue: valor completo del tooltip.
 */
export function Heatmap(props) {
  const { rows, columns, bin, neutralColumns = [], formatCell, formatValue, describeCell, countHeader, label } = props
  const [ref, width] = useElementWidth()
  const [active, setActive] = useState(null)
  const left = LABEL_WIDTH + COUNT_WIDTH
  const cellWidth = Math.max((width - left) / columns.length - GAP, 12)
  const height = HEADER + rows.length * (ROW + GAP)
  const cellX = (column) => left + column * (cellWidth + GAP)
  const cellY = (row) => HEADER + row * (ROW + GAP)

  return (
    <div ref={ref} className="chart heatmap">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}>
          <text className="axis" x={left - 8} y={HEADER - 8} textAnchor="end">
            {countHeader}
          </text>
          {columns.map((column, index) => (
            <text key={column.key} className="axis" x={cellX(index) + cellWidth / 2} y={HEADER - 8} textAnchor="middle">
              {column.label}
            </text>
          ))}
          {rows.map((row, rowIndex) => (
            <g key={row.key} className={row.muted ? 'heat-row is-muted' : 'heat-row'}>
              <text className="heat-label" x={0} y={cellY(rowIndex) + ROW / 2} dy="0.32em">
                {row.label}
              </text>
              <text className="axis num" x={left - 8} y={cellY(rowIndex) + ROW / 2} dy="0.32em" textAnchor="end">
                {row.count}
              </text>
              {row.cells.map((value, column) => {
                if (value === null) return null
                const tone = neutralColumns.includes(column) ? 'neutral' : bin(value)
                return (
                  <g
                    key={columns[column].key}
                    className={`heat-cell heat-cell--${tone}`}
                    onPointerEnter={() => setActive({ row: rowIndex, column })}
                    onPointerLeave={() => setActive(null)}
                  >
                    <rect x={cellX(column)} y={cellY(rowIndex)} width={cellWidth} height={ROW} rx="3" />
                    {cellWidth >= 22 && (
                      <text x={cellX(column) + cellWidth / 2} y={cellY(rowIndex) + ROW / 2} dy="0.32em" textAnchor="middle">
                        {formatCell(value)}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          ))}
        </svg>
      )}
      {active && (
        <Tooltip
          x={cellX(active.column) + cellWidth / 2}
          y={cellY(active.row) + ROW / 2}
          containerWidth={width}
          value={formatValue(rows[active.row].cells[active.column])}
          label={describeCell(rows[active.row], columns[active.column])}
        />
      )}
    </div>
  )
}
