import { DataTable } from '../../components/DataTable.jsx'
import { Meter } from '../../components/Meter.jsx'
import { EmptyState } from '../../components/States.jsx'
import { formatNumber, formatPct } from '../../lib/format.js'

const COLUMNS = [
  {
    key: 'arista',
    header: 'Si compra A → también compra B',
    primary: true,
    render: (row) => (
      <span className="edge">
        <span>{row.desde_nombre}</span>
        <span className="edge-arrow" aria-label="también compra">
          →
        </span>
        <span>{row.hacia_nombre}</span>
      </span>
    ),
  },
  {
    key: 'confianza',
    header: 'Confianza P(B | A)',
    numeric: true,
    render: (row) => (
      <span className="cell-bar">
        <Meter value={row.confianza} max={1} />
        {formatPct(row.confianza * 100)}
      </span>
    ),
  },
  { key: 'lift', header: 'Lift', numeric: true, render: (row) => `${formatNumber(row.lift, 2)}×` },
  { key: 'usuarios', header: 'Usuarios con A y B', numeric: true, render: (row) => formatNumber(row.usuarios) },
]

export function AffinityTable({ rows }) {
  if (!rows.length) {
    return (
      <EmptyState title="Sin aristas que mostrar">
        Una arista necesita al menos 30 usuarios distintos que compren A y B, y lift mayor que 1.
      </EmptyState>
    )
  }
  return (
    <DataTable
      caption="Afinidad dirigida entre conceptos"
      columns={COLUMNS}
      rows={rows}
      rowKey={(row) => `${row.desde}-${row.hacia}`}
    />
  )
}
