import { DataTable } from '../../components/DataTable.jsx'
import { Icon } from '../../components/Icon.jsx'
import { EmptyState } from '../../components/States.jsx'
import { formatNumber, formatPct } from '../../lib/format.js'
import { verticalLabel } from '../../lib/labels.js'

const QUALITY_FLAG_PCT = 10

function QualityCell({ value }) {
  if (value === null || value < QUALITY_FLAG_PCT) return formatPct(value)
  return (
    <span className="status status--warn">
      <Icon name="warn" />
      {formatPct(value)}
    </span>
  )
}

const COLUMNS = [
  { key: 'vertical', header: 'Vertical', primary: true, render: (row) => verticalLabel(row.vertical) },
  { key: 'productos', header: 'Productos', numeric: true, render: (row) => formatNumber(row.productos) },
  { key: 'imagen', header: 'Sin imagen', numeric: true, render: (row) => <QualityCell value={row.sin_imagen_pct} /> },
  { key: 'categoria', header: 'Sin categoría', numeric: true, render: (row) => <QualityCell value={row.sin_categoria_pct} /> },
  { key: 'concepto', header: 'Sin concepto', numeric: true, render: (row) => <QualityCell value={row.sin_concepto_pct} /> },
]

export function QualityTable({ rows }) {
  if (!rows.length) return <EmptyState title="Sin productos en la muestra" />
  return (
    <>
      <DataTable caption="Calidad del catálogo por vertical" columns={COLUMNS} rows={rows} rowKey={(row) => row.vertical} />
      <p className="card-note">
        Marcado desde {QUALITY_FLAG_PCT}%. «Sin concepto» es el producto que la capa de conceptos no pudo clasificar: no
        entra en las recomendaciones entre verticales.
      </p>
    </>
  )
}
