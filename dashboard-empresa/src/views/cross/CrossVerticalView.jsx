import { Async } from '../../components/Async.jsx'
import { Card } from '../../components/Card.jsx'
import { Icon } from '../../components/Icon.jsx'
import { ProvenanceBadge } from '../../components/ProvenanceBadge.jsx'
import { useAnalytics } from '../../lib/useAnalytics.js'
import { AffinityTable } from './AffinityTable.jsx'
import { MultiVerticalRetention } from './MultiVerticalRetention.jsx'
import { SuggestionPerformance } from './SuggestionPerformance.jsx'
import './cross.css'

const EDGE_NOTES = {
  synthetic: 'Aristas aprendidas de datos simulados: solo se ven en el panel. El agente NO las usa.',
  prototype: 'Aristas aprendidas de pruebas en el prototipo, no de clientes reales: sirven para revisar la mecánica.',
}

function Suggestions({ source }) {
  return <SuggestionPerformance rows={useAnalytics('suggestions', source)} />
}

function Affinity({ source }) {
  return <AffinityTable rows={useAnalytics('affinity', source)} />
}

function MultiVertical({ source }) {
  return <MultiVerticalRetention rows={useAnalytics('multi-vertical', source)} />
}

export function CrossVerticalView({ source }) {
  const badge = <ProvenanceBadge kind={source} />
  return (
    <div className="view">
      <section className="section" aria-labelledby="sugerencias">
        <div className="section-head">
          <p className="eyebrow">Bigotes entre verticales</p>
          <h2 id="sugerencias">Rendimiento de las sugerencias cruzadas</h2>
          <p>
            Aceptada: el producto sugerido se agregó al carro en la sesión. Convertida: se pidió en 24 horas o menos.
          </p>
        </div>
        <Card
          title="Mostradas, aceptadas y convertidas"
          subtitle="Por concepto sugerido y vertical donde está el producto. Barras anidadas sobre la misma escala."
          badge={badge}
        >
          <Async>
            <Suggestions source={source} />
          </Async>
        </Card>
      </section>

      <section className="section" aria-labelledby="afinidad">
        <div className="section-head">
          <p className="eyebrow">Qué va con qué</p>
          <h2 id="afinidad">Afinidad dirigida A → B</h2>
          <p>
            Confianza = P(B | A): de quienes compran A, qué parte compra B. El lift mayor que 1 solo filtra: es simétrico
            y no da dirección.
          </p>
        </div>
        <Card
          title="Aristas por co-ocurrencia"
          subtitle="Mínimo 30 usuarios con A y B; no cuenta lo que se agregó desde una sugerencia de Bigotes; nunca hacia conceptos sensibles."
          badge={badge}
        >
          <p className="callout status status--warn">
            <Icon name="warn" />
            {EDGE_NOTES[source]}
          </p>
          <Async>
            <Affinity source={source} />
          </Async>
        </Card>
      </section>

      <section className="section" aria-labelledby="multi-vertical">
        <div className="section-head">
          <p className="eyebrow">¿Retiene más quien usa dos verticales?</p>
          <h2 id="multi-vertical">Retención multi-vertical vs un vertical, por estrato</h2>
          <p>
            Quien pide más cae más en dos verticales y además retiene más; por eso se compara a igual número de pedidos,
            y aun así no mide causa: eso solo lo da un A/B con holdout.
          </p>
        </div>
        <Card
          title="Retención (pidió entre los días 61 y 120) por número de pedidos en sus primeros 60 días"
          subtitle="Solo usuarios cuyo primer pedido fue hace 120 días o más."
          badge={badge}
        >
          <Async>
            <MultiVertical source={source} />
          </Async>
          {source === 'synthetic' && (
            <p className="card-note">
              <strong>Supuesto del simulador:</strong> el generador asume que quien usa más verticales se va menos, así
              que acá esa relación aparece por construcción. Con datos reales se mide y puede no cumplirse.
            </p>
          )}
        </Card>
      </section>
    </div>
  )
}
