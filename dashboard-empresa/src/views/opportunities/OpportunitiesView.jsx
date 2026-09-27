import { Async } from '../../components/Async.jsx'
import { Card } from '../../components/Card.jsx'
import { ProvenanceBadge } from '../../components/ProvenanceBadge.jsx'
import { EmptyState } from '../../components/States.jsx'
import { useAnalytics, useAnalyticsMany } from '../../lib/useAnalytics.js'
import { splitTrends } from './trends.js'
import { TrendList } from './TrendList.jsx'
import { UnmetDemand } from './UnmetDemand.jsx'
import './opportunities.css'

function UnmetCard({ source }) {
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
    <div className="grid-2 trends">
      <div className="trend-group">
        <h4>Suben · {rising.length}</h4>
        {rising.length ? (
          <TrendList rows={rising} max={max} direction="up" unmetConcepts={unmetConcepts} />
        ) : (
          <p className="cell-sub">Ningún concepto sube.</p>
        )}
      </div>
      <div className="trend-group">
        <h4>Bajan · {falling.length}</h4>
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
          <p className="eyebrow">Lo que piden y no encuentran</p>
          <h2 id="oportunidades">Oportunidades de negocio</h2>
          <p>
            Cada búsqueda o consulta a Bigotes sin resultado es una encuesta: qué falta, dónde y para cuántos usuarios.
          </p>
        </div>
        <Card
          title="Demanda no satisfecha"
          subtitle="Agrupada por concepto (o consulta, si no calza con ninguno) y vertical. Ordenada por usuarios distintos; crecimiento: últimas 4 semanas vs las 4 anteriores."
          badge={<ProvenanceBadge kind={source} />}
        >
          <Async>
            <UnmetCard source={source} />
          </Async>
        </Card>
      </section>

      <section className="section" aria-labelledby="tendencias">
        <div className="section-head">
          <p className="eyebrow">Interés por concepto</p>
          <h2 id="tendencias">Conceptos que suben y bajan</h2>
          <p>
            Señales de interés (búsquedas, chat y agregados al carro): últimas 4 semanas contra las 4 anteriores. No
            incluye conceptos sensibles.
          </p>
        </div>
        <Card
          title="Cambio de interés en 4 semanas"
          subtitle="Mismo largo de barra = mismo cambio en ambas listas. «Sin oferta»: además es demanda no satisfecha."
          badge={<ProvenanceBadge kind={source} />}
          index={1}
        >
          <Async>
            <Trends source={source} />
          </Async>
        </Card>
      </section>
    </div>
  )
}
