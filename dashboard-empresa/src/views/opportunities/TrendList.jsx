import { Delta } from '../../components/Delta.jsx'
import { HBar } from '../../components/charts/HBar.jsx'
import { formatNumber, formatSignedPct } from '../../lib/format.js'

/**
 * Lista rankeada de conceptos que suben (verde) o bajan (rojo), con una escala común `max` para ambas listas.
 * Marca los conceptos que además son demanda no satisfecha (suben, pero no hay qué ofrecer).
 */
export function TrendList({ rows, max, direction, unmetConcepts }) {
  const fill = direction === 'up' ? 'fill-good' : 'fill-bad'
  return (
    <ol className="rank-list">
      {rows.map((row) => (
        <li key={row.concept_id} className="rank-row">
          <span className="rank-label">
            <span>
              {row.concepto}
              {unmetConcepts.has(row.concept_id) && <span className="chip chip--warn">sin oferta</span>}
            </span>
            <span className="cell-sub num">
              {formatNumber(row.recientes)} vs {formatNumber(row.anteriores)} señales
            </span>
          </span>
          <HBar domain={[0, max]} segments={[{ value: Math.abs(row.crecimiento_pct), className: fill }]} />
          <span className="rank-value">
            <Delta value={row.crecimiento_pct} format={formatSignedPct} goodWhen="up" />
          </span>
        </li>
      ))}
    </ol>
  )
}
