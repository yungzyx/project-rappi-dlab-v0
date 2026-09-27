import { ChartTableSwitch } from '../../components/ChartTableSwitch.jsx'
import { DataTable } from '../../components/DataTable.jsx'
import { Heatmap } from '../../components/charts/Heatmap.jsx'
import { EmptyState } from '../../components/States.jsx'
import { formatNumber, formatPct, formatShortDate } from '../../lib/format.js'
import { buildCohortMatrix, RETENTION_BINS, retentionBin, SMALL_COHORT } from './cohorts.js'

const SCALE = [0, ...RETENTION_BINS].map((from, index, all) => ({
  bin: index + 1,
  label: index === all.length - 1 ? `${from}+` : `${from}–${all[index + 1]}`,
}))

function ScaleLegend() {
  return (
    <div className="scale-legend">
      <span>% que vuelve a pedir</span>
      <ol>
        {SCALE.map((step) => (
          <li key={step.bin}>
            <span style={{ background: `var(--seq-${step.bin})` }} />
            {step.label}
          </li>
        ))}
      </ol>
    </div>
  )
}

function CohortTable({ matrix }) {
  const columns = [
    { key: 'cohort', header: 'Cohorte', primary: true, render: (row) => formatShortDate(row.cohort) },
    { key: 'users', header: 'Usuarios', numeric: true, render: (row) => formatNumber(row.users) },
    ...matrix.weeks.map((week) => ({
      key: `s${week}`,
      header: `S${week}`,
      numeric: true,
      render: (row) => formatPct(row.cells[week]),
    })),
  ]
  return <DataTable caption="Retención por cohorte semanal" columns={columns} rows={matrix.cohorts} rowKey={(row) => row.cohort} />
}

export function CohortHeatmap({ data, asOf }) {
  const matrix = buildCohortMatrix(data, asOf)
  if (!matrix.cohorts.length) {
    return <EmptyState title="Sin cohortes">Esta fuente todavía no tiene pedidos.</EmptyState>
  }
  const hasSmall = matrix.cohorts.some((row) => row.small)
  return (
    <>
      <ChartTableSwitch
        chart={
          <>
            <Heatmap
              rows={matrix.cohorts.map((row) => ({
                key: row.cohort,
                label: `${formatShortDate(row.cohort)}${row.small ? '*' : ''}`,
                count: formatNumber(row.users),
                cells: row.cells,
                muted: row.small,
              }))}
              columns={matrix.weeks.map((week) => ({ key: week, label: `S${week}` }))}
              countHeader="n"
              bin={retentionBin}
              neutralColumns={[0]}
              formatCell={(value) => formatNumber(value)}
              formatValue={(value) => formatPct(value)}
              describeCell={(row, column) =>
                `Cohorte del ${row.label.replace('*', '')} (${row.count} usuarios), semana ${column.key}`
              }
              label="Retención por cohorte semanal: porcentaje de cada cohorte que vuelve a pedir en cada semana."
            />
            <ScaleLegend />
          </>
        }
        table={<CohortTable matrix={matrix} />}
      />
      <p className="card-note">
        S0 es la semana del primer pedido (siempre 100%). Una celda vacía es una semana que todavía no termina.
        {hasSmall && ` * Cohortes con menos de ${SMALL_COHORT} usuarios: porcentajes inestables.`}
      </p>
    </>
  )
}
