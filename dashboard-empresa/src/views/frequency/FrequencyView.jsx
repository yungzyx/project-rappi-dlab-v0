import { Async } from '../../components/Async.jsx'
import { Card } from '../../components/Card.jsx'
import { Headline } from '../../components/Headline.jsx'
import { ProvenanceBadge } from '../../components/ProvenanceBadge.jsx'
import { formatNumber, formatPct } from '../../lib/format.js'
import { verticalLabel } from '../../lib/labels.js'
import { useAnalytics, useAnalyticsMany } from '../../lib/useAnalytics.js'
import { AtRiskTable } from './AtRiskTable.jsx'
import { CohortHeatmap } from './CohortHeatmap.jsx'
import { funnelRows } from './funnel.js'
import { FunnelChart } from './FunnelChart.jsx'
import { RhythmChart } from './RhythmChart.jsx'
import './frequency.css'

/** Titular: conversión global buscan → piden (todas las sesiones, todos los verticales). */
function FunnelHeadline({ source }) {
  const data = useAnalytics('funnel', source)
  const searched = data.reduce((total, row) => total + (row.buscan ?? 0), 0)
  const ordered = data.reduce((total, row) => total + (row.piden ?? 0), 0)
  if (!searched) return null
  const rows = funnelRows(data)
  const worst = [...rows].filter((row) => row.overallPct !== null).sort((a, b) => a.overallPct - b.overallPct)[0]
  return (
    <Headline
      value={formatPct((ordered * 100) / searched)}
      unit="de las sesiones que buscan terminan en pedido"
      context={worst ? `la conversión más baja: ${verticalLabel(worst.vertical)}, ${formatPct(worst.overallPct)}` : undefined}
    />
  )
}

/** Titular: el ritmo típico (mediana de días entre pedidos). */
function RhythmHeadline({ source }) {
  const kpis = useAnalytics('kpis', source)
  if (kpis.mediana_dias_entre_pedidos === null || kpis.mediana_dias_entre_pedidos === undefined) return null
  return (
    <Headline
      value={formatNumber(kpis.mediana_dias_entre_pedidos, 1)}
      unit="días entre pedidos, mediana"
      context="el ritmo contra el que se mide el riesgo"
    />
  )
}

/** Titular: usuarios en riesgo (los que todavía se pueden recuperar). */
function RiskHeadline({ source }) {
  const kpis = useAnalytics('kpis', source)
  if (!(kpis.en_riesgo > 0)) return null
  return (
    <Headline
      value={formatNumber(kpis.en_riesgo)}
      unit="usuarios en riesgo"
      context={`y ${formatNumber(kpis.perdidos)} perdidos, más de 3 veces su ritmo sin pedir`}
      tone="brand"
    />
  )
}

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
          <h2 id="embudo">Dónde se pierden</h2>
          <p>Sesiones que buscan → agregan al carro → inician pago → piden. El largo de cada barra es el % de las que buscan.</p>
          <Async fallback={null}>
            <FunnelHeadline source={source} />
          </Async>
        </div>
        <Card title="Conversión por etapa" subtitle="Una sesión cuenta en una etapa solo si pasó por las anteriores." badge={badge}>
          <Async>
            <Funnel source={source} />
          </Async>
        </Card>
      </section>

      <section className="section" aria-labelledby="retencion">
        <div className="section-head">
          <h2 id="retencion">Cuánto vuelven</h2>
          <p>Frecuencia es volver a tiempo: cada usuario tiene su propio ritmo, y el riesgo se mide contra ese ritmo.</p>
          <Async fallback={null}>
            <RhythmHeadline source={source} />
          </Async>
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
          <h2 id="riesgo">A quién rescatar</h2>
          <p>
            Id seudónimo; el concepto top nunca es sensible. Los avisos fuera de la app solo van a quien dio su
            consentimiento.
          </p>
          <Async fallback={null}>
            <RiskHeadline source={source} />
          </Async>
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
