import { HBar } from '../../components/charts/HBar.jsx'
import { Delta } from '../../components/Delta.jsx'
import { EmptyState } from '../../components/States.jsx'
import { formatNumber, formatPct, formatPoints } from '../../lib/format.js'
import { GROUPS, MIN_GROUP_USERS, strataRows } from './strata.js'

function GroupBar({ group, value }) {
  if (!value) {
    return (
      <div className="strata-bar">
        <span className="strata-group">{group.label}</span>
        <span className="strata-missing">Sin grupo: menos de {MIN_GROUP_USERS} usuarios</span>
      </div>
    )
  }
  return (
    <div className="strata-bar">
      <span className="strata-group">{group.label}</span>
      <HBar domain={[0, 100]} segments={[{ value: value.retencion_pct, className: group.fill }]} />
      <span className="strata-value num">
        <strong>{formatPct(value.retencion_pct)}</strong> · {formatNumber(value.usuarios)} usuarios
      </span>
    </div>
  )
}

export function MultiVerticalRetention({ rows }) {
  if (!rows.length) {
    return (
      <EmptyState title="Sin usuarios elegibles">
        La comparación usa usuarios cuyo primer pedido fue hace 120 días o más, en grupos de al menos{' '}
        {MIN_GROUP_USERS}.
      </EmptyState>
    )
  }
  return (
    <>
      <div className="legend">
        {GROUPS.map((group) => (
          <span key={group.key} className="legend-item">
            <span className="swatch" style={{ background: group.swatch }} />
            {group.label}
          </span>
        ))}
      </div>
      <div className="strata">
        {strataRows(rows).map((row) => (
          <section key={row.stratum} className="strata-row" aria-label={row.stratum}>
            <h3>
              {row.stratum}
              {row.gap !== null && <Delta value={row.gap} format={formatPoints} goodWhen={null} suffix="multi − un vertical" />}
            </h3>
            {GROUPS.map((group, index) => (
              <GroupBar key={group.key} group={group} value={row.groups[index]} />
            ))}
          </section>
        ))}
      </div>
    </>
  )
}
