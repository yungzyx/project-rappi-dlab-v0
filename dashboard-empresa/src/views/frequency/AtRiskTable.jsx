import { useState } from 'react'
import { DataTable } from '../../components/DataTable.jsx'
import { EmptyState } from '../../components/States.jsx'
import { StatusLabel } from '../../components/StatusLabel.jsx'
import { formatNumber } from '../../lib/format.js'

const PREVIEW_ROWS = 12

const COLUMNS = [
  { key: 'usuario', header: 'Usuario', primary: true, render: (row) => <span className="mono">{row.usuario}</span> },
  { key: 'estado', header: 'Estado', render: (row) => <StatusLabel status={row.estado} /> },
  { key: 'persona', header: 'Perfil', render: (row) => (row.persona ? <span className="chip">{row.persona}</span> : '—') },
  { key: 'ritmo', header: 'Ritmo (días)', numeric: true, render: (row) => formatNumber(row.ritmo_dias, 1) },
  { key: 'dias', header: 'Días sin pedir', numeric: true, render: (row) => formatNumber(row.dias_sin_pedir) },
  { key: 'concepto', header: 'Concepto top', render: (row) => row.concepto_top ?? '—' },
  { key: 'avisos', header: 'Acepta avisos', render: (row) => (row.consiente_avisos ? 'Sí' : 'No') },
  { key: 'accion', header: 'Acción sugerida', wide: true, render: (row) => <span className="action-cell">{row.accion}</span> },
]

/** Lista de usuarios en riesgo o perdidos (id seudónimo) y un aviso si la lista no alcanza a mostrar a todos. */
export function AtRiskTable({ rows, kpis }) {
  const [expanded, setExpanded] = useState(false)
  if (!rows.length) {
    return (
      <EmptyState title="Nadie en riesgo ni perdido">
        Nadie superó 2 veces su propio ritmo sin pedir (o todavía no hay usuarios con 2 pedidos).
      </EmptyState>
    )
  }
  const shownAtRisk = rows.filter((row) => row.estado === 'en_riesgo').length
  const missingAtRisk = shownAtRisk === 0 && kpis.en_riesgo > 0
  return (
    <>
      <p className="table-summary">
        Se muestran <strong className="num">{formatNumber(rows.length)}</strong> de{' '}
        <strong className="num">{formatNumber(kpis.en_riesgo + kpis.perdidos)}</strong> usuarios ({formatNumber(kpis.en_riesgo)}{' '}
        en riesgo y {formatNumber(kpis.perdidos)} perdidos).
      </p>
      {missingAtRisk && (
        <p className="table-warning status status--warn">
          La API entrega como máximo {rows.length} filas y ordena primero a los perdidos: los{' '}
          {formatNumber(kpis.en_riesgo)} usuarios en riesgo, los más fáciles de recuperar, no alcanzan a aparecer.
        </p>
      )}
      <DataTable
        caption="Usuarios en riesgo o perdidos"
        columns={COLUMNS}
        rows={expanded ? rows : rows.slice(0, PREVIEW_ROWS)}
        rowKey={(row) => row.usuario}
      />
      {rows.length > PREVIEW_ROWS && (
        <div className="view-switch">
          <button type="button" className="text-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            {expanded ? `Ver solo los primeros ${PREVIEW_ROWS}` : `Ver los ${formatNumber(rows.length)}`}
          </button>
        </div>
      )}
    </>
  )
}
