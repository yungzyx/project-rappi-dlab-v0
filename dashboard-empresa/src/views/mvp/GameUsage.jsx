import { DataTable } from '../../components/DataTable.jsx'
import { EmptyState } from '../../components/States.jsx'
import { formatNumber } from '../../lib/format.js'
import { plural, verticalLabel } from '../../lib/labels.js'
import { Stats } from './Stats.jsx'

const MIN_ROUNDS_FOR_AVERAGE = 5

const COLUMNS = [
  { key: 'vertical_juego', header: 'Vertical', primary: true, render: (row) => verticalLabel(row.vertical_juego) },
  { key: 'rondas', header: 'Rondas', numeric: true, render: (row) => formatNumber(row.rondas) },
  { key: 'tarjetas', header: 'Tarjetas', numeric: true, render: (row) => formatNumber(row.tarjetas) },
]

/** Juego de verticales: rondas terminadas, tarjetas descubiertas y estrellas promedio (— hasta tener rondas suficientes). */
export function GameUsage({ data, source }) {
  const { personas, rondas, tarjetas, estrellas_promedio: stars, por_vertical: byVertical } = data
  if (!rondas && !tarjetas) {
    return source === 'synthetic' ? (
      <EmptyState title="Los datos simulados no incluyen el juego">Solo el prototipo registra rondas y tarjetas.</EmptyState>
    ) : (
      <EmptyState title="Nadie jugó todavía">Aparece cuando alguien termina una ronda o descubre una tarjeta.</EmptyState>
    )
  }
  return (
    <>
      <Stats
        items={[
          { label: 'Personas', value: `${formatNumber(personas)} ${plural(personas, 'persona')}` },
          { label: 'Rondas', value: formatNumber(rondas) },
          { label: 'Tarjetas', value: formatNumber(tarjetas) },
          { label: 'Estrellas promedio (de 0 a 3)', value: formatNumber(stars, 1) },
        ]}
      />
      {byVertical.length > 0 && (
        <DataTable
          caption="Juego por vertical"
          columns={COLUMNS}
          rows={byVertical}
          rowKey={(row) => row.vertical_juego}
        />
      )}
      <p className="card-note">El promedio de estrellas aparece desde {MIN_ROUNDS_FOR_AVERAGE} rondas.</p>
    </>
  )
}
