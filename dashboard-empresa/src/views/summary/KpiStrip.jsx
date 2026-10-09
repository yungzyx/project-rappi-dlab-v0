import { Icon } from '../../components/Icon.jsx'
import { useAnalytics } from '../../lib/useAnalytics.js'
import { KPI_GROUPS } from './kpis.js'

const STATUS_ICONS = { warn: 'warn', bad: 'stop' }

function KpiTile({ item, kpis }) {
  const value = kpis[item.key]
  const missing = value === null || value === undefined
  return (
    <article className="kpi">
      <h4 className={item.status ? `kpi-label status status--${item.status}` : 'kpi-label'}>
        {item.status && <Icon name={STATUS_ICONS[item.status]} />}
        {item.label}
        {item.window && <span className="chip">{item.window}</span>}
      </h4>
      <p className="kpi-value">
        {item.format(value)}
        {item.unit && !missing && <span className="kpi-unit">{item.unit}</span>}
      </p>
      {missing && <p className="kpi-context">Sin datos suficientes en esta fuente.</p>}
      {!missing && item.context && <p className="kpi-context">{item.context(kpis)}</p>}
      <p className="kpi-definition">{item.definition}</p>
    </article>
  )
}

export function KpiStrip({ source }) {
  const kpis = useAnalytics('kpis', source)
  return (
    <div className="kpi-groups">
      {KPI_GROUPS.map((group, index) => (
        <section key={group.title} className="kpi-group enter" style={{ '--i': index + 1 }} aria-label={group.title}>
          <h3 className="kpi-group-title">{group.title}</h3>
          <div className="kpi-row">
            {group.items.map((item) => (
              <KpiTile key={item.key} item={item} kpis={kpis} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
