import { ColumnChart } from '../../components/charts/ColumnChart.jsx'
import { EmptyState } from '../../components/States.jsx'
import { formatNumber } from '../../lib/format.js'

export function RhythmChart({ data, median }) {
  if (!data.length) {
    return (
      <EmptyState title="Sin ritmos que mostrar">El ritmo necesita usuarios con al menos dos pedidos.</EmptyState>
    )
  }
  const total = data.reduce((sum, bucket) => sum + bucket.usuarios, 0)
  return (
    <>
      <ColumnChart
        data={data.map((bucket) => ({ key: bucket.dias, label: `${bucket.dias} d`, value: bucket.usuarios }))}
        formatValue={formatNumber}
        describe={(item) => `usuarios piden cada ${item.key} días`}
        label={`Usuarios por ritmo de compra (días entre pedidos). ${formatNumber(total)} usuarios con 2 o más pedidos.`}
      />
      <p className="card-note">
        Mediana general: <strong className="num">{formatNumber(median, 1)} días</strong>. El ritmo de cada usuario define
        cuándo pasa a «en riesgo» (más de 2 veces su ritmo, mínimo 21 días) y a «perdido» (3 veces, mínimo 45).
      </p>
    </>
  )
}
