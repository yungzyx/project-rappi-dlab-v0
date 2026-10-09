import { Async } from '../../components/Async.jsx'
import { Headline } from '../../components/Headline.jsx'
import { Icon } from '../../components/Icon.jsx'
import { ProvenanceBadge } from '../../components/ProvenanceBadge.jsx'
import { formatNumber, formatPct, formatPoints } from '../../lib/format.js'
import { useAnalytics } from '../../lib/useAnalytics.js'
import { AffinityTable } from './AffinityTable.jsx'
import { MultiVerticalRetention } from './MultiVerticalRetention.jsx'
import { ServiceEngagement } from './ServiceEngagement.jsx'
import { strataRows } from './strata.js'
import { MIN_SHOWN_FOR_RATE, SuggestionPerformance } from './SuggestionPerformance.jsx'
import './cross.css'

const EDGE_NOTES = {
  synthetic: 'Aristas aprendidas de datos simulados: solo se ven en el panel. El agente NO las usa.',
  prototype: 'Aristas aprendidas de pruebas en el prototipo, no de clientes reales: sirven para revisar la mecánica.',
}

const sum = (rows, key) => rows.reduce((total, row) => total + (row[key] ?? 0), 0)

/** Titular de la vista: aceptación global de las sugerencias cruzadas. */
function SuggestionHeadline({ source }) {
  const rows = useAnalytics('suggestions', source)
  const shown = sum(rows, 'mostradas')
  if (!shown) return null
  const accepted = sum(rows, 'aceptadas')
  if (shown < MIN_SHOWN_FOR_RATE) {
    return (
      <Headline
        value={formatNumber(shown)}
        unit="sugerencias cruzadas mostradas"
        context={`${formatNumber(accepted)} aceptadas; el % aparece desde ${MIN_SHOWN_FOR_RATE} mostradas`}
        tone="brand"
      />
    )
  }
  return (
    <Headline
      value={formatPct((accepted * 100) / shown)}
      unit="de las sugerencias cruzadas se aceptan"
      context={`${formatNumber(accepted)} aceptadas de ${formatNumber(shown)} mostradas`}
      tone="brand"
    />
  )
}

/** Titular menor: la arista con más confianza (de quienes compran A, qué parte compra B). */
function AffinityHeadline({ source }) {
  const rows = useAnalytics('affinity', source)
  if (!rows.length) return null
  const [top] = [...rows].sort((a, b) => b.confianza - a.confianza)
  return (
    <Headline
      value={formatPct(top.confianza * 100, 0)}
      unit={`${top.desde_nombre} → ${top.hacia_nombre}`}
      context="la relación con más confianza"
      size="minor"
    />
  )
}

/** Titular menor: la diferencia de retención multi-vertical vs un vertical donde se puede comparar. */
function RetentionHeadline({ source }) {
  const rows = useAnalytics('multi-vertical', source)
  if (!rows.length) return null
  const comparable = strataRows(rows).find((row) => row.gap !== null)
  if (comparable) {
    return (
      <Headline
        value={formatPoints(comparable.gap)}
        unit="de retención a favor de quien usa dos verticales"
        context={`a igual número de compras (${comparable.stratum})`}
        size="minor"
      />
    )
  }
  const best = [...rows].sort((a, b) => b.retencion_pct - a.retencion_pct)[0]
  return (
    <Headline
      value={formatPct(best.retencion_pct)}
      unit={`retención, ${best.grupo}, ${best.estrato}`}
      context="sin grupo de un vertical contra qué comparar"
      size="minor"
    />
  )
}

function Suggestions({ source }) {
  return <SuggestionPerformance rows={useAnalytics('suggestions', source)} />
}

function Services({ source }) {
  return <ServiceEngagement rows={useAnalytics('services', source)} />
}

function Affinity({ source }) {
  return <AffinityTable rows={useAnalytics('affinity', source)} />
}

function MultiVertical({ source }) {
  return <MultiVerticalRetention rows={useAnalytics('multi-vertical', source)} />
}

export function CrossVerticalView({ source }) {
  return (
    <div className="view">
      <section className="section" aria-labelledby="sugerencias">
        <div className="section-head">
          <h2 id="sugerencias">Bigotes entre verticales</h2>
          <p>
            Aceptada: el producto sugerido (en el chat o en «Para ti») se agregó al carro. Convertida: llegó a un pedido.
            Por concepto sugerido y vertical donde está el producto; barras anidadas sobre la misma escala.
          </p>
          <ProvenanceBadge kind={source} />
          <Async fallback={null}>
            <SuggestionHeadline source={source} />
          </Async>
        </div>
        <div className="block enter">
          <Async>
            <Suggestions source={source} />
          </Async>
        </div>
      </section>

      <section className="section" aria-labelledby="servicios">
        <div className="section-head">
          <h2 id="servicios">Servicios sin catálogo</h2>
          <p>
            RappiTravel y RappiFavor no tienen productos: Bigotes los ofrece cuando alguien habla de un viaje o de un
            envío, y RappiFavor también cuando no encuentra lo que busca. El gancho es lo que sugiere del catálogo junto
            con el servicio (protector solar para un viaje).
          </p>
        </div>
        <div className="block enter">
          <Async>
            <Services source={source} />
          </Async>
        </div>
      </section>

      <section className="section" aria-labelledby="afinidad">
        <div className="section-head">
          <h2 id="afinidad">Qué va con qué</h2>
          <p>
            Confianza = P(B | A): de quienes compran A, qué parte compra B. El lift mayor que 1 solo filtra: es simétrico
            y no da dirección. Mínimo 30 usuarios con A y B; no cuenta lo que se agregó desde una sugerencia de Bigotes;
            nunca hacia conceptos sensibles.
          </p>
          <Async fallback={null}>
            <AffinityHeadline source={source} />
          </Async>
        </div>
        <div className="block enter">
          <p className="table-warning status status--warn">
            <Icon name="warn" />
            {EDGE_NOTES[source]}
          </p>
          <Async>
            <Affinity source={source} />
          </Async>
        </div>
      </section>

      <section className="section" aria-labelledby="multi-vertical">
        <div className="section-head">
          <h2 id="multi-vertical">¿Retiene más quien usa dos verticales?</h2>
          <p>
            Retención (pidió entre los días 61 y 120) por número de compras en sus primeros 60 días, solo usuarios cuyo
            primer pedido fue hace 120 días o más. Una compra es un carro: dividido en dos verticales son dos pedidos.
            Quien pide más cae más en dos verticales y además retiene más; por eso se compara a igual número de
            compras, y aun así no mide causa: eso solo lo da un A/B con holdout.
          </p>
          <Async fallback={null}>
            <RetentionHeadline source={source} />
          </Async>
        </div>
        <div className="block enter">
          <Async>
            <MultiVertical source={source} />
          </Async>
          {source === 'synthetic' && (
            <p className="card-note">
              <strong>Supuesto del simulador:</strong> el generador asume que quien usa más verticales se va menos, así
              que acá esa relación aparece por construcción. Con datos reales se mide y puede no cumplirse.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
