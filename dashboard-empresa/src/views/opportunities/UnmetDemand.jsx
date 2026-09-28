import { DataTable } from '../../components/DataTable.jsx'
import { Delta } from '../../components/Delta.jsx'
import { Meter } from '../../components/Meter.jsx'
import { EmptyState } from '../../components/States.jsx'
import { formatNumber, formatSignedPct } from '../../lib/format.js'
import { demandLabel, verticalLabel } from '../../lib/labels.js'

function Growth({ value }) {
  if (value === null || value === undefined) return <span className="cell-sub">nueva</span>
  // Neutro a propósito: que crezca la demanda sin oferta es urgencia, no un resultado bueno ni malo.
  return <Delta value={value} format={formatSignedPct} goodWhen={null} />
}

function WhereItExists({ value }) {
  if (!value) return <span className="cell-sub">En ningún otro vertical</span>
  return <span className="cell-list">{value.split(', ').map(verticalLabel).join(', ')}</span>
}

export function UnmetDemand({ rows }) {
  if (!rows.length) {
    return (
      <EmptyState title="Sin demanda no satisfecha que mostrar">
        La API solo agrupa consultas sin resultado que pidieron 5 o más usuarios distintos.
      </EmptyState>
    )
  }
  const maxUsers = Math.max(...rows.map((row) => row.usuarios))
  const columns = [
    {
      key: 'que',
      header: 'Qué piden',
      primary: true,
      render: (row) => (
        <span className="cell-stack">
          <strong>{demandLabel(row)}</strong>
          <span className="cell-sub">{row.concept_id ? 'Concepto' : 'Consulta sin concepto'}</span>
        </span>
      ),
    },
    { key: 'vertical', header: 'Vertical', render: (row) => verticalLabel(row.vertical) },
    {
      key: 'usuarios',
      header: 'Usuarios',
      numeric: true,
      render: (row) => (
        <span className="cell-bar">
          <Meter value={row.usuarios} max={maxUsers} />
          {formatNumber(row.usuarios)}
        </span>
      ),
    },
    { key: 'busquedas', header: 'Búsquedas', numeric: true, render: (row) => formatNumber(row.busquedas) },
    { key: 'crecimiento', header: 'Crecimiento', numeric: true, render: (row) => <Growth value={row.crecimiento_pct} /> },
    { key: 'existe_en', header: 'Dónde existe', render: (row) => <WhereItExists value={row.existe_en} /> },
    { key: 'accion', header: 'Acción sugerida', wide: true, render: (row) => <span className="action-cell">{row.accion}</span> },
  ]
  return (
    <DataTable
      caption="Demanda no satisfecha por concepto y vertical"
      columns={columns}
      rows={rows}
      rowKey={(row) => `${row.vertical}-${row.concept_id ?? row.que}`}
    />
  )
}
