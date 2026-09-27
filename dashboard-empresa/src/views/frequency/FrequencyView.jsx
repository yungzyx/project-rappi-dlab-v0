import { Async } from '../../components/Async.jsx'
import { Card } from '../../components/Card.jsx'
import { ProvenanceBadge } from '../../components/ProvenanceBadge.jsx'
import { useAnalytics, useAnalyticsMany } from '../../lib/useAnalytics.js'
import { AtRiskTable } from './AtRiskTable.jsx'
import { CohortHeatmap } from './CohortHeatmap.jsx'
import { FunnelChart } from './FunnelChart.jsx'
import { RhythmChart } from './RhythmChart.jsx'
import './frequency.css'

function Funnel({ source }) {
  return <FunnelChart data={useAnalytics('funnel', source)} />
}

function Cohorts({ source }) {
  const [cohorts, kpis] = useAnalyticsMany(['cohorts', 'kpis'], source)
  return <CohortHeatmap data={cohorts} asOf={kpis.as_of} />
}

function Rhythm({ source }) {
  const [rhythm, kpis] = useAnalyticsMany(['rhythm', 'kpis'], source)
  return <RhythmChart data={rhythm} median={kpis.mediana_dias_entre_pedidos} />
}

function AtRisk({ source }) {
  const [rows, kpis] = useAnalyticsMany(['at-risk', 'kpis'], source)
  return <AtRiskTable rows={rows} kpis={kpis} />
}

export function FrequencyView({ source }) {
  const badge = <ProvenanceBadge kind={source} />
  return (
    <div className="view">
      <section className="section" aria-labelledby="embudo">
        <div className="section-head">
          <p className="eyebrow">Dónde se pierden</p>
          <h2 id="embudo">Embudo por vertical</h2>
          <p>Sesiones que buscan → agregan al carro → inician pago → piden. El largo de cada barra es el % de las que buscan.</p>
        </div>
        <Card title="Conversión por etapa" subtitle="Una sesión cuenta en una etapa solo si pasó por las anteriores." badge={badge}>
          <Async>
            <Funnel source={source} />
          </Async>
        </Card>
      </section>

      <section className="section" aria-labelledby="retencion">
        <div className="section-head">
          <p className="eyebrow">Cuánto vuelven</p>
          <h2 id="retencion">Retención y ritmo</h2>
          <p>Frecuencia es volver a tiempo: cada usuario tiene su propio ritmo, y el riesgo se mide contra ese ritmo.</p>
        </div>
        <div className="grid-2 retention-grid">
          <Card
            title="Retención por cohorte semanal"
            subtitle="Cohorte = semana del primer pedido. Cada celda: % de la cohorte que vuelve a pedir en la semana k."
            badge={badge}
          >
            <Async>
              <Cohorts source={source} />
            </Async>
          </Card>
          <Card
            title="Días entre pedidos"
            subtitle="Ritmo de cada usuario: mediana de días entre sus pedidos de los últimos 180 días."
            badge={badge}
            index={1}
          >
            <Async>
              <Rhythm source={source} />
            </Async>
          </Card>
        </div>
      </section>

      <section className="section" aria-labelledby="riesgo">
        <div className="section-head">
          <p className="eyebrow">A quién rescatar</p>
          <h2 id="riesgo">Usuarios en riesgo y perdidos</h2>
          <p>
            Id seudónimo; el concepto top nunca es sensible. Los avisos fuera de la app solo van a quien dio su
            consentimiento.
          </p>
        </div>
        <Card title="Lista para reactivación" subtitle="Ordenada por estado y por días sin pedir." badge={badge}>
          <Async>
            <AtRisk source={source} />
          </Async>
        </Card>
      </section>
    </div>
  )
}
