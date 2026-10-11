import { DataTable } from '../../components/DataTable.jsx'
import { EmptyState } from '../../components/States.jsx'
import { formatNumber, formatPct } from '../../lib/format.js'
import { plural } from '../../lib/labels.js'
import { MIN_SHOWN_FOR_RATE } from '../cross/SuggestionPerformance.jsx'
import { Stats } from './Stats.jsx'

const MOMENTS = {
  plan: 'Plan',
  carrito: 'Carro',
  checkout: 'Antes de pagar',
  proximo_pedido: 'Próximo pedido',
  sin_resultado: 'Sin resultado',
  vertical_por_probar: 'Vertical por probar',
  pregunta: 'Pregunta',
  para_ti: 'Para ti',
  sin_momento: 'Sin momento',
}

const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0)

const COLUMNS = [
  { key: 'momento', header: 'Momento', primary: true, render: (row) => MOMENTS[row.momento] ?? row.momento },
  { key: 'mostradas', header: 'Mostradas', numeric: true, render: (row) => formatNumber(row.mostradas) },
  { key: 'aceptadas', header: 'Aceptadas', numeric: true, render: (row) => formatNumber(row.aceptadas) },
  { key: 'aceptacion_pct', header: 'Tasa de aceptación', numeric: true, render: (row) => formatPct(row.aceptacion_pct) },
]

/** Ofertas del agente por momento. La tasa llega vacía (—) con menos mostradas que el mínimo: ahí solo valen las cuentas. */
export function OffersByMoment({ data, source }) {
  const { personas, momentos } = data
  if (!momentos.length) {
    return (
      <EmptyState title="El agente todavía no hizo ofertas">
        Aparecen cuando una sugerencia se muestra en la app.
      </EmptyState>
    )
  }
  // El simulador no guarda en qué momento se hizo cada oferta: todo cae en «sin momento».
  if (source === 'synthetic' && momentos.every((row) => row.momento === 'sin_momento')) {
    return (
      <EmptyState title="Los datos simulados no registran el momento de la oferta">
        Solo el prototipo guarda de dónde viene cada oferta.
      </EmptyState>
    )
  }
  return (
    <>
      <Stats
        items={[
          { label: 'Personas', value: `${formatNumber(personas)} ${plural(personas, 'persona')}` },
          { label: 'Mostradas', value: formatNumber(sum(momentos, 'mostradas')) },
          { label: 'Aceptadas', value: formatNumber(sum(momentos, 'aceptadas')) },
        ]}
      />
      <DataTable
        caption="Ofertas del agente por momento"
        columns={COLUMNS}
        rows={momentos}
        rowKey={(row) => row.momento}
      />
      <p className="card-note">La tasa aparece desde {MIN_SHOWN_FOR_RATE} mostradas; antes, solo las cuentas.</p>
    </>
  )
}
