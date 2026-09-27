import { Async } from '../../components/Async.jsx'
import { Card } from '../../components/Card.jsx'
import { ProvenanceBadge } from '../../components/ProvenanceBadge.jsx'
import { CATALOG } from '../../lib/api.js'
import { useAnalytics } from '../../lib/useAnalytics.js'
import { AssortmentTable } from './AssortmentTable.jsx'
import { CoverageChart } from './CoverageChart.jsx'
import { CrossProducts } from './CrossProducts.jsx'
import { QualityTable } from './QualityTable.jsx'
import './catalog.css'

const DEMAND_NOTES = {
  synthetic: 'Los ítems son reales (muestra pública); los usuarios que buscan son simulados.',
  prototype: 'Los ítems son reales (muestra pública); los usuarios que buscan vienen de pruebas en el prototipo.',
}

// El catálogo no depende de la fuente de usuarios: siempre es la muestra pública real.
function Coverage() {
  return <CoverageChart data={useAnalytics(CATALOG).cobertura} />
}

function Quality() {
  return <QualityTable rows={useAnalytics(CATALOG).calidad} />
}

function Cross() {
  return <CrossProducts rows={useAnalytics(CATALOG).cruzados_reales} />
}

function Assortment({ source }) {
  return <AssortmentTable rows={useAnalytics('assortment', source)} />
}

export function CatalogView({ source }) {
  const real = <ProvenanceBadge kind="real" />
  return (
    <div className="view">
      <section className="section" aria-labelledby="catalogo-real">
        <div className="section-head">
          <p className="eyebrow">Muestra pública real de rappi.cl</p>
          <h2 id="catalogo-real">Salud del catálogo</h2>
          <p>
            Datos reales del scraper: la muestra trae hasta 24 productos por sub-pasillo, así que «no está» no significa
            «Rappi no lo vende».
          </p>
        </div>
        <Card
          title="Cobertura por vertical"
          subtitle="Productos obtenidos en la muestra frente a los que declaran los pasillos de las tiendas."
          badge={real}
        >
          <Async>
            <Coverage />
          </Async>
        </Card>
        <div className="grid-2">
          <Card title="Calidad de los datos" subtitle="% de productos de cada vertical con el dato faltante." badge={real} index={1}>
            <Async>
              <Quality />
            </Async>
          </Card>
          <Card title="Productos en varios verticales" subtitle="El mismo producto a la venta en 2 o más verticales." badge={real} index={2}>
            <Async>
              <Cross />
            </Async>
          </Card>
        </div>
      </section>

      <section className="section" aria-labelledby="surtido">
        <div className="section-head">
          <p className="eyebrow">Dónde hay más interés que oferta</p>
          <h2 id="surtido">Surtido vs demanda</h2>
          <p>Ordenado por usuarios por ítem: arriba, conceptos con mucha búsqueda y poco surtido real.</p>
        </div>
        <Card
          title="Surtido real frente a demanda"
          subtitle={DEMAND_NOTES[source]}
          badge={<ProvenanceBadge kind={`demand-${source}`} />}
        >
          <Async>
            <Assortment source={source} />
          </Async>
        </Card>
      </section>
    </div>
  )
}
