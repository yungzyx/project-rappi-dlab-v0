import { ChartTableSwitch } from '../../components/ChartTableSwitch.jsx'
import { DataTable } from '../../components/DataTable.jsx'
import { HBar } from '../../components/charts/HBar.jsx'
import { EmptyState } from '../../components/States.jsx'
import { formatNumber, formatPct } from '../../lib/format.js'
import { verticalLabel } from '../../lib/labels.js'

const TOP = 12
// Etapas anidadas (ordinal): mostradas ⊃ aceptadas ⊃ convertidas.
const STAGES = [
  { key: 'mostradas', label: 'Mostradas', fill: 'fill-ord-1', swatch: 'var(--ord-1)' },
  { key: 'aceptadas', label: 'Aceptadas', fill: 'fill-ord-3', swatch: 'var(--ord-3)' },
  { key: 'convertidas', label: 'Convertidas', fill: 'fill-ord-4', swatch: 'var(--ord-4)' },
]
const COUNTS = [...STAGES, { key: 'ignoradas', label: 'Ignoradas' }]

const sum = (rows, key) => rows.reduce((total, row) => total + (row[key] ?? 0), 0)

/** Con menos de 10 mostradas (una demo en vivo) un % no dice nada: se muestran solo los conteos. */
export const MIN_SHOWN_FOR_RATE = 10

function Totals({ rows }) {
  const shown = sum(rows, 'mostradas')
  const accepted = sum(rows, 'aceptadas')
  const converted = sum(rows, 'convertidas')
  const rate = (part, whole) => (shown >= MIN_SHOWN_FOR_RATE && whole ? (part * 100) / whole : null)
  return (
    <>
      <dl className="totals">
        <div>
          <dt>Mostradas</dt>
          <dd className="num">{formatNumber(shown)}</dd>
        </div>
        <div>
          <dt>Aceptadas</dt>
          <dd className="num">
            {formatNumber(accepted)} <span>{formatPct(rate(accepted, shown))} de las mostradas</span>
          </dd>
        </div>
        <div>
          <dt>Convertidas</dt>
          <dd className="num">
            {formatNumber(converted)} <span>{formatPct(rate(converted, accepted))} de las aceptadas</span>
          </dd>
        </div>
        <div>
          <dt>Ignoradas</dt>
          <dd className="num">{formatNumber(sum(rows, 'ignoradas'))}</dd>
        </div>
      </dl>
      {shown < MIN_SHOWN_FOR_RATE && (
        <p className="card-note">Muestra chica: el % de aceptación aparece desde {MIN_SHOWN_FOR_RATE} mostradas.</p>
      )}
    </>
  )
}

function Legend() {
  return (
    <div className="legend">
      {STAGES.map((stage) => (
        <span key={stage.key} className="legend-item">
          <span className="swatch" style={{ background: stage.swatch }} />
          {stage.label}
        </span>
      ))}
    </div>
  )
}

function SuggestionBars({ rows }) {
  const max = Math.max(...rows.map((row) => row.mostradas))
  return (
    <>
      <Legend />
      <ol className="rank-list">
        {rows.map((row) => (
          <li key={`${row.concepto}-${row.vertical}`} className="rank-row">
            <span className="rank-label">
              <span>{row.concepto}</span>
              <span className="cell-sub">en {verticalLabel(row.vertical)}</span>
            </span>
            <HBar
              domain={[0, max]}
              segments={STAGES.map((stage) => ({ value: row[stage.key], className: stage.fill }))}
            />
            <span className="rank-value cell-stack">
              <strong className="num">{formatPct(row.aceptacion_pct)}</strong>
              <span className="cell-sub">aceptación</span>
            </span>
          </li>
        ))}
      </ol>
    </>
  )
}

function SuggestionTable({ rows }) {
  const columns = [
    { key: 'concepto', header: 'Sugerencia', primary: true, render: (row) => row.concepto },
    { key: 'vertical', header: 'Vertical sugerido', render: (row) => verticalLabel(row.vertical) },
    ...COUNTS.map(({ key, label }) => ({
      key,
      header: label,
      numeric: true,
      render: (row) => formatNumber(row[key]),
    })),
    { key: 'aceptacion', header: 'Aceptación', numeric: true, render: (row) => formatPct(row.aceptacion_pct) },
  ]
  return (
    <DataTable
      caption="Rendimiento de las sugerencias cruzadas de Bigotes"
      columns={columns}
      rows={rows}
      rowKey={(row) => `${row.concepto}-${row.vertical}`}
    />
  )
}

export function SuggestionPerformance({ rows }) {
  if (!rows.length) {
    return (
      <EmptyState title="Sin sugerencias que evaluar">
        La API muestra cada sugerencia (concepto y vertical) cuando se mostró al menos 10 veces.
      </EmptyState>
    )
  }
  const top = [...rows].sort((a, b) => b.mostradas - a.mostradas).slice(0, TOP)
  return (
    <div className="suggestions">
      <Totals rows={rows} />
      <div className="suggestions-bars">
        <ChartTableSwitch chart={<SuggestionBars rows={top} />} table={<SuggestionTable rows={rows} />} />
        {rows.length > TOP && (
          <p className="card-note">
            El gráfico muestra las {TOP} sugerencias más mostradas; la tabla trae las {rows.length}.
          </p>
        )}
      </div>
    </div>
  )
}
