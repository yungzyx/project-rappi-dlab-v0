import { Icon } from '../../components/Icon.jsx'
import { ProvenanceBadge } from '../../components/ProvenanceBadge.jsx'
import { useAnalyticsMany } from '../../lib/useAnalytics.js'
import { pickActions } from './actions.js'

export function ActionList({ source, onNavigate }) {
  const [opportunities, trends, kpis] = useAnalyticsMany(['opportunities', 'trends', 'kpis'], source)
  const actions = pickActions({ opportunities, trends, kpis })

  return (
    <div className="actions-panel enter">
      <header className="actions-head">
        <div>
          <p className="eyebrow">Qué hacer esta semana</p>
          <h2 id="que-hacer">
            {actions.length ? `${actions.length} decisiones que salen de los datos` : 'Sin señales suficientes'}
          </h2>
        </div>
        <ProvenanceBadge kind={source} />
      </header>
      {actions.length === 0 ? (
        <p className="actions-empty">
          Con los datos de esta fuente no hay demanda no satisfecha, conceptos que suban ni usuarios en riesgo que
          superen los mínimos de la API.
        </p>
      ) : (
        <ol className="actions">
          {actions.map((action, index) => (
            <li key={action.id} className="action">
              <p className="action-kind">
                <span className="action-index">{index + 1}</span>
                {action.kind}
              </p>
              <p className="action-figure">
                <strong>{action.figure}</strong> {action.unit}
              </p>
              <h3>{action.title}</h3>
              <p className="action-detail">{action.detail}</p>
              <p className="action-do">
                <span>Acción</span>
                {action.action}
              </p>
              <button type="button" className="action-link" onClick={() => onNavigate(action.view)}>
                {action.linkLabel}
                <Icon name="arrowRight" />
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="actions-foot">Cada acción se valida con un grupo de control (A/B con holdout) antes de escalar.</p>
    </div>
  )
}
