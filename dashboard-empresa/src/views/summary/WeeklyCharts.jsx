import { ChartTableSwitch } from '../../components/ChartTableSwitch.jsx'
import { DataTable } from '../../components/DataTable.jsx'
import { Delta } from '../../components/Delta.jsx'
import { EmptyState } from '../../components/States.jsx'
import { LineChart } from '../../components/charts/LineChart.jsx'
import { formatShortDate } from '../../lib/format.js'
import { useAnalyticsMany } from '../../lib/useAnalytics.js'
import { COMPARE_WEEKS, isPartialWeek, tickDecimals, WEEKLY_SERIES, weeklySeries } from './weekly.js'

function SeriesCard({ rows, series, asOf }) {
  const { points, latest, change, formatChange } = weeklySeries(rows, series, asOf)
  return (
    <figure className="series-card">
      <figcaption>
        <span className="series-title">{series.title}</span>
        <span className="series-value">
          <strong>{latest ? series.format(latest.value) : '—'}</strong>
          <span>{series.unit}</span>
        </span>
        <Delta value={change} format={formatChange} goodWhen={series.goodWhen} suffix={`vs hace ${COMPARE_WEEKS} semanas`} />
      </figcaption>
      <LineChart
        points={points}
        formatValue={series.format}
        formatTick={(value) => series.format(value, tickDecimals(value))}
        integerTicks={!series.rate}
        label={`${series.title} por semana. Última semana completa: ${latest ? series.format(latest.value) : 'sin dato'}.`}
      />
    </figure>
  )
}

function WeeklyTable({ rows, asOf }) {
  const columns = [
    {
      key: 'semana',
      header: 'Semana del',
      primary: true,
      render: (row) => `${formatShortDate(row.semana)}${isPartialWeek(row.semana, asOf) ? ' (parcial)' : ''}`,
    },
    ...WEEKLY_SERIES.map((series) => ({
      key: series.key,
      header: series.title,
      numeric: true,
      render: (row) => series.format(row[series.key]),
    })),
  ]
  return <DataTable caption="Serie semanal" columns={columns} rows={rows} rowKey={(row) => row.semana} />
}

export function WeeklyCharts({ source }) {
  const [rows, kpis] = useAnalyticsMany(['weekly', 'kpis'], source)
  if (rows.length < 2) {
    return (
      <EmptyState title="Todavía no hay semanas suficientes">
        Se necesitan al menos dos semanas con eventos para dibujar la serie ({rows.length} en esta fuente).
      </EmptyState>
    )
  }
  return (
    <ChartTableSwitch
      chart={
        <div className="series-grid">
          {WEEKLY_SERIES.map((series) => (
            <SeriesCard key={series.key} rows={rows} series={series} asOf={kpis.as_of} />
          ))}
        </div>
      }
      table={<WeeklyTable rows={rows} asOf={kpis.as_of} />}
    />
  )
}
