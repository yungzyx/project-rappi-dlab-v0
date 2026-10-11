import { DataTable } from '../../components/DataTable.jsx'
import { EmptyState } from '../../components/States.jsx'
import { formatNumber } from '../../lib/format.js'
import { plural, verticalLabel } from '../../lib/labels.js'
import { Stats } from './Stats.jsx'

const COLUMNS = [
  { key: 'vertical', header: 'Vertical', primary: true, render: (row) => (row.vertical ? verticalLabel(row.vertical) : 'Sin vertical') },
  { key: 'concepto', header: 'Concepto', render: (row) => row.concepto ?? 'Sin concepto reconocido' },
  { key: 'sin_resultado', header: 'Sin resultado', numeric: true, render: (row) => formatNumber(row.sin_resultado) },
]

/** Búsquedas que no encontraron nada, por vertical y concepto. Nunca el texto buscado (la API no lo entrega). */
export function UnmetSearches({ data }) {
  const { personas, busquedas, sin_resultado: unmet, por_vertical: rows } = data
  if (!busquedas) {
    return <EmptyState title="Todavía no hay búsquedas">Aparecen cuando alguien busca en la app.</EmptyState>
  }
  return (
    <>
      <Stats
        items={[
          { label: 'Personas', value: `${formatNumber(personas)} ${plural(personas, 'persona')}` },
          { label: 'Búsquedas', value: `${formatNumber(unmet)} de ${formatNumber(busquedas)} ${plural(busquedas, 'búsqueda')} sin resultado` },
        ]}
      />
      {rows.length > 0 && (
        <DataTable
          caption="Búsquedas sin resultado por vertical y concepto"
          columns={COLUMNS}
          rows={rows}
          rowKey={(row) => `${row.vertical}/${row.concepto ?? ''}`}
        />
      )}
      <p className="card-note">Hasta 20 filas, por vertical y concepto; nunca el texto que escribió la persona.</p>
    </>
  )
}
