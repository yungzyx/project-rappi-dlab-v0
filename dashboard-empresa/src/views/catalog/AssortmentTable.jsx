import { DataTable } from '../../components/DataTable.jsx'
import { Meter } from '../../components/Meter.jsx'
import { EmptyState } from '../../components/States.jsx'
import { formatNumber } from '../../lib/format.js'
import { verticalLabel } from '../../lib/labels.js'

export function AssortmentTable({ rows }) {
  if (!rows.length) {
    return <EmptyState title="Sin demanda registrada">Esta fuente no tiene búsquedas ni chats con concepto.</EmptyState>
  }
  const maxUsers = Math.max(...rows.map((row) => row.usuarios_que_buscan))
  const columns = [
    { key: 'concepto', header: 'Concepto', primary: true, render: (row) => row.concepto },
    { key: 'vertical', header: 'Vertical', render: (row) => verticalLabel(row.vertical) },
    {
      key: 'usuarios',
      header: 'Usuarios que buscan',
      numeric: true,
      render: (row) => (
        <span className="cell-bar">
          <Meter value={row.usuarios_que_buscan} max={maxUsers} />
          {formatNumber(row.usuarios_que_buscan)}
        </span>
      ),
    },
    {
      key: 'items',
      header: 'Ítems en catálogo',
      numeric: true,
      render: (row) =>
        row.items_en_catalogo > 0 ? formatNumber(row.items_en_catalogo) : <span className="chip chip--warn">sin oferta</span>,
    },
    {
      key: 'ratio',
      header: 'Usuarios por ítem',
      numeric: true,
      // Con 0 ítems la API divide por 1: la razón no significa nada y se muestra como raya.
      render: (row) => (row.items_en_catalogo > 0 ? formatNumber(row.usuarios_por_item, 1) : '—'),
    },
  ]
  return (
    <DataTable
      caption="Surtido real frente a demanda"
      columns={columns}
      rows={rows}
      rowKey={(row) => `${row.concepto}-${row.vertical}`}
      // Separador donde la razón baja de 1: arriba, más gente buscando que ítems (la historia de la sección)
      rowClassName={(row, index) =>
        index > 0 && rows[index - 1].usuarios_por_item >= 1 && row.usuarios_por_item < 1 ? 'is-group-start' : undefined
      }
    />
  )
}
