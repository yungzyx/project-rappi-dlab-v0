import { HBar } from '../../components/charts/HBar.jsx'
import { EmptyState } from '../../components/States.jsx'
import { formatNumber } from '../../lib/format.js'
import { crossVerticalSummary } from './coverage.js'

export function CrossProducts({ rows }) {
  const { total, rows: sorted } = crossVerticalSummary(rows)
  if (!total) return <EmptyState title="Ningún producto aparece en 2 o más verticales" />
  const max = Math.max(...sorted.map((row) => row.productos))
  return (
    <>
      <p className="hero-number">
        <strong>{formatNumber(total)}</strong>
        <span>productos que se venden en 2 o más verticales</span>
      </p>
      <ol className="rank-list">
        {sorted.map((row) => (
          <li key={row.n_verticales} className="rank-row">
            <span className="rank-label">En {row.n_verticales} verticales</span>
            <HBar domain={[0, max]} segments={[{ value: row.productos, className: 'fill-data' }]} />
            <span className="rank-value num">{formatNumber(row.productos)}</span>
          </li>
        ))}
      </ol>
      <p className="card-note">
        Mismo <span className="mono">master_product_id</span>, contando solo tiendas de un único vertical: Lider, Express
        Lider y Unimarc aparecen como conveniencia y como súper, y con ellas la cifra casi se duplica.
      </p>
    </>
  )
}
