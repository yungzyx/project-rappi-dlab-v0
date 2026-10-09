import { DataTable } from '../../components/DataTable.jsx'
import { EmptyState } from '../../components/States.jsx'
import { formatNumber, formatPct } from '../../lib/format.js'

const COLUMNS = [
  { key: 'nombre', header: 'Servicio', primary: true },
  { key: 'ofrecido', header: 'Bigotes lo ofreció', numeric: true, render: (row) => formatNumber(row.ofrecido) },
  {
    key: 'abierto',
    header: 'Se abrió',
    numeric: true,
    render: (row) =>
      row.ofrecido
        ? `${formatNumber(row.abierto)} (${formatPct((row.abierto * 100) / row.ofrecido, 0)})`
        : formatNumber(row.abierto),
  },
  {
    key: 'ganchos',
    header: 'Gancho del catálogo aceptado',
    numeric: true,
    render: (row) =>
      row.ganchos_mostrados
        ? `${formatNumber(row.ganchos_aceptados)} de ${formatNumber(row.ganchos_mostrados)}`
        : 'no tiene',
  },
]

/** Servicios sin catálogo (RappiTravel, RappiFavor): ofrecidos por Bigotes, abiertos y ganchos del catálogo aceptados. */
export function ServiceEngagement({ rows }) {
  if (!rows.some((row) => row.ofrecido)) {
    return (
      <EmptyState title="Bigotes todavía no ofreció servicios">
        Aparecen cuando alguien habla de un viaje o de un envío, o no encuentra lo que busca.
      </EmptyState>
    )
  }
  return <DataTable caption="Servicios sin catálogo" columns={COLUMNS} rows={rows} rowKey={(row) => row.servicio} />
}
