import { ChartTableSwitch } from '../../components/ChartTableSwitch.jsx'
import { DataTable } from '../../components/DataTable.jsx'
import { HBar } from '../../components/charts/HBar.jsx'
import { Icon } from '../../components/Icon.jsx'
import { EmptyState } from '../../components/States.jsx'
import { formatNumber, formatPct } from '../../lib/format.js'
import { plural, verticalLabel } from '../../lib/labels.js'
import { coverageRows } from './coverage.js'

function CoverageValue({ row }) {
  if (row.overCount) {
    return (
      <span className="rank-value cell-stack">
        <strong className="status status--warn">
          <Icon name="warn" />
          No calza
        </strong>
        <span className="cell-sub">obtenidos &gt; declarados</span>
      </span>
    )
  }
  return (
    <span className="rank-value cell-stack">
      <strong className="num">{formatPct(row.coveragePct, 0)}</strong>
      <span className="cell-sub">cobertura</span>
    </span>
  )
}

function CoverageBars({ rows }) {
  const max = Math.max(...rows.flatMap((row) => [row.declarados, row.obtenidos]))
  return (
    <>
      <div className="legend">
        <span className="legend-item">
          <span className="swatch" style={{ background: 'var(--deemph)' }} />
          Declarados por las tiendas
        </span>
        <span className="legend-item">
          <span className="swatch" style={{ background: 'var(--data)' }} />
          Obtenidos en la muestra
        </span>
      </div>
      <ol className="rank-list">
        {rows.map((row) => (
          <li key={row.vertical} className="rank-row">
            <span className="rank-label">
              <span>{verticalLabel(row.vertical)}</span>
              <span className="cell-sub num">
                {formatNumber(row.obtenidos)} de {formatNumber(row.declarados)} · {formatNumber(row.tiendas)}{' '}
                {plural(row.tiendas, 'tienda')}
              </span>
            </span>
            <HBar
              domain={[0, max]}
              segments={[
                { value: row.declarados, className: 'fill-deemph' },
                { value: row.obtenidos, className: 'fill-data' },
              ]}
            />
            <CoverageValue row={row} />
          </li>
        ))}
      </ol>
    </>
  )
}

function CoverageTable({ rows }) {
  const columns = [
    { key: 'vertical', header: 'Vertical', primary: true, render: (row) => verticalLabel(row.vertical) },
    { key: 'tiendas', header: 'Tiendas', numeric: true, render: (row) => formatNumber(row.tiendas) },
    { key: 'declarados', header: 'Declarados', numeric: true, render: (row) => formatNumber(row.declarados) },
    { key: 'obtenidos', header: 'Obtenidos', numeric: true, render: (row) => formatNumber(row.obtenidos) },
    {
      key: 'cobertura',
      header: 'Cobertura',
      numeric: true,
      render: (row) => (row.overCount ? 'No calza' : formatPct(row.coveragePct, 0)),
    },
  ]
  return <DataTable caption="Cobertura por vertical" columns={columns} rows={rows} rowKey={(row) => row.vertical} />
}

export function CoverageChart({ data }) {
  const rows = coverageRows(data)
  if (!rows.length) return <EmptyState title="Sin tiendas en la muestra">El catálogo todavía no tiene pasillos.</EmptyState>
  const flagged = rows.filter((row) => row.overCount)
  return (
    <>
      <ChartTableSwitch chart={<CoverageBars rows={rows} />} table={<CoverageTable rows={rows} />} />
      {flagged.length > 0 && (
        <p className="card-note">
          <strong>No calza:</strong> en {flagged.map((row) => verticalLabel(row.vertical)).join(' y ')} se obtuvieron
          más productos que los declarados. Probablemente tiendas con doble etiqueta de vertical que suman productos a un
          vertical y declarados a otro: hay que revisar el conteo antes de leerlo como cobertura.
        </p>
      )}
    </>
  )
}
