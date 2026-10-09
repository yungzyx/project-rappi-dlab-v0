import { Async } from '../../components/Async.jsx'
import { Headline } from '../../components/Headline.jsx'
import { ProvenanceBadge } from '../../components/ProvenanceBadge.jsx'
import { EmptyState } from '../../components/States.jsx'
import { formatNumber, formatSignedPct } from '../../lib/format.js'
import { demandLabel } from '../../lib/labels.js'
import { useAnalytics, useAnalyticsMany } from '../../lib/useAnalytics.js'
import { splitTrends } from './trends.js'
import { TrendList } from './TrendList.jsx'
import { UnmetDemand } from './UnmetDemand.jsx'
import './opportunities.css'

/** Titular de la vista: búsquedas sin resultado de la demanda agrupada. Se suman búsquedas y no usuarios: la misma
 * persona aparece en varias filas (con los datos simulados, la suma de usuarios daba 1.204 contra 824 distintos). */
function UnmetHeadline({ source }) {
  const rows = useAnalytics('opportunities', source)
  if (!rows.length) return null
  const searches = rows.reduce((total, row) => total + row.busquedas, 0)
  const [top] = [...rows].sort((a, b) => b.usuarios - a.usuarios)
  return (
    <Headline
      value={formatNumber(searches)}
      unit="búsquedas sin resultado"
      context={`${rows.length} demandas agrupadas · la mayor: ${demandLabel(top)} (${formatNumber(top.usuarios)} usuarios)`}
      tone="brand"
    />
  )
}

/** Titular menor: el concepto que más sube en 4 semanas. */
function TrendHeadline({ source }) {
  const trends = useAnalytics('trends', source)
  const { rising } = splitTrends(trends)
  if (!rising.length) return null
  return (
    <Headline
      value={formatSignedPct(rising[0].crecimiento_pct)}
      unit={rising[0].concepto}
      context="el concepto que más sube en 4 semanas"
      size="minor"
    />
  )
}

function Unmet({ source }) {
  const rows = useAnalytics('opportunities', source)
  return (
    <>
      <UnmetDemand rows={rows} />
      <p className="card-note">
        <strong>«No está en el catálogo» no es «Rappi no lo vende»:</strong> la muestra pública trae hasta 24 productos
        por sub-pasillo. Cada fila es una señal que hay que validar antes de salir a captar comercios.
      </p>
    </>
  )
}

function Trends({ source }) {
  const [trends, opportunities] = useAnalyticsMany(['trends', 'opportunities'], source)
  const { rising, falling, max } = splitTrends(trends)
  const unmetConcepts = new Set(opportunities.map((row) => row.concept_id).filter(Boolean))
  if (!rising.length && !falling.length) {
    return (
      <EmptyState title="Sin tendencias que mostrar">
        La API compara conceptos con 20 o más señales en las 4 semanas anteriores; esta fuente no llega a ese mínimo.
      </EmptyState>
    )
  }
  return (
    <div className="trends">
      <div className="trend-group">
        <h3>Suben · {rising.length}</h3>
        {rising.length ? (
          <TrendList rows={rising} max={max} direction="up" unmetConcepts={unmetConcepts} />
        ) : (
          <p className="cell-sub">Ningún concepto sube.</p>
        )}
      </div>
      <div className="trend-group">
        <h3>Bajan · {falling.length}</h3>
        {falling.length ? (
          <TrendList rows={falling} max={max} direction="down" unmetConcepts={unmetConcepts} />
        ) : (
          <p className="cell-sub">Ningún concepto baja.</p>
        )}
      </div>
    </div>
  )
}

export function OpportunitiesView({ source }) {
  return (
    <div className="view">
      <section className="section" aria-labelledby="oportunidades">
        <div className="section-head">
          <h2 id="oportunidades">Lo que piden y no encuentran</h2>
          <p>
            Cada búsqueda o consulta a Bigotes sin resultado es una encuesta: qué falta, dónde y para cuántos usuarios.
            Agrupada por concepto (o consulta, si no calza con ninguno) y vertical; ordenada por usuarios distintos.
            Crecimiento: últimas 4 semanas contra las 4 anteriores.
          </p>
          <ProvenanceBadge kind={source} />
          <Async fallback={null}>
            <UnmetHeadline source={source} />
          </Async>
        </div>
        <div className="block enter">
          <Async>
            <Unmet source={source} />
          </Async>
        </div>
      </section>

      <section className="section" aria-labelledby="tendencias">
        <div className="section-head">
          <h2 id="tendencias">Conceptos que suben y bajan</h2>
          <p>
            Señales de interés (búsquedas, chat y agregados al carro): últimas 4 semanas contra las 4 anteriores, sin
            conceptos sensibles. Mismo largo de barra = mismo cambio en ambas listas; «sin oferta» = además es demanda
            no satisfecha.
          </p>
          <Async fallback={null}>
            <TrendHeadline source={source} />
          </Async>
        </div>
        <div className="block enter" style={{ '--i': 1 }}>
          <Async>
            <Trends source={source} />
          </Async>
        </div>
      </section>
    </div>
  )
}
