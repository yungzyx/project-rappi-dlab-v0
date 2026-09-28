import { ChartTableSwitch } from '../../components/ChartTableSwitch.jsx'
import { DataTable } from '../../components/DataTable.jsx'
import { HBar } from '../../components/charts/HBar.jsx'
import { Icon } from '../../components/Icon.jsx'
import { EmptyState } from '../../components/States.jsx'
import { formatNumber, formatPct } from '../../lib/format.js'
import { verticalLabel } from '../../lib/labels.js'
import { FUNNEL_STAGES, funnelRows } from './funnel.js'

function Funnel({ row }) {
  return (
    <article className={row.overallPct === null ? 'funnel is-empty' : 'funnel'}>
      <header>
        <h3>{verticalLabel(row.vertical)}</h3>
        <p>
          <strong className="num">{formatPct(row.overallPct)}</strong> de las sesiones que buscan terminan en pedido
        </p>
      </header>
      <ol className="funnel-stages">
        {row.stages.map((stage, index) => (
          <li key={stage.key} className="funnel-stage">
            <span className="funnel-label">
              {stage.label}
              {stage.stepPct !== null && <span className="cell-sub num">{formatPct(stage.stepPct)} del anterior</span>}
            </span>
            <HBar domain={[0, 100]} segments={[{ value: stage.shareOfTop ?? 0, className: `fill-ord-${index + 1}` }]} />
            <span className="funnel-count num">{formatNumber(stage.count)}</span>
          </li>
        ))}
      </ol>
      {row.worstStep && (
        <p className="funnel-loss status status--bad">
          <Icon name="down" />
          Mayor pérdida {row.worstStep.from} {row.worstStep.to}: {formatPct(100 - row.worstStep.stepPct)} no sigue
        </p>
      )}
    </article>
  )
}

function FunnelTable({ rows }) {
  const columns = [
    { key: 'vertical', header: 'Vertical', primary: true, render: (row) => verticalLabel(row.vertical) },
    ...FUNNEL_STAGES.map((stage, index) => ({
      key: stage.key,
      header: stage.label,
      numeric: true,
      render: (row) => (
        <span className="cell-stack">
          {formatNumber(row.stages[index].count)}
          {index > 0 && <span className="cell-sub">{formatPct(row.stages[index].stepPct)}</span>}
        </span>
      ),
    })),
    { key: 'total', header: 'Buscan → piden', numeric: true, render: (row) => formatPct(row.overallPct) },
  ]
  return <DataTable caption="Embudo por vertical" columns={columns} rows={rows} rowKey={(row) => row.vertical} />
}

export function FunnelChart({ data }) {
  const rows = funnelRows(data)
  if (!rows.length) {
    return <EmptyState title="Sin sesiones con vertical">Esta fuente todavía no tiene sesiones de búsqueda.</EmptyState>
  }
  return (
    <ChartTableSwitch
      chart={
        <div className="funnel-grid">
          {rows.map((row) => (
            <Funnel key={row.vertical} row={row} />
          ))}
        </div>
      }
      table={<FunnelTable rows={rows} />}
    />
  )
}
