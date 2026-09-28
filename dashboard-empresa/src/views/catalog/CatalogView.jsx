import { Async } from '../../components/Async.jsx'
import { Card } from '../../components/Card.jsx'
import { Headline } from '../../components/Headline.jsx'
import { ProvenanceBadge } from '../../components/ProvenanceBadge.jsx'
import { CATALOG } from '../../lib/api.js'
import { formatNumber, formatPct } from '../../lib/format.js'
import { verticalLabel } from '../../lib/labels.js'
import { useAnalytics } from '../../lib/useAnalytics.js'
import { AssortmentTable } from './AssortmentTable.jsx'
import { coverageRows } from './coverage.js'
import { CoverageChart } from './CoverageChart.jsx'
import { CrossProducts } from './CrossProducts.jsx'
import { QualityTable } from './QualityTable.jsx'
import './catalog.css'

const DEMAND_NOTES = {
  synthetic: 'Los ítems son reales (muestra pública); los usuarios que buscan son simulados.',
  prototype: 'Los ítems son reales (muestra pública); los usuarios que buscan vienen de pruebas en el prototipo.',
}

/** Titular de la vista: productos obtenidos en la muestra y cobertura global frente a lo declarado. */
function CoverageHeadline() {
  const rows = coverageRows(useAnalytics(CATALOG).cobertura)
  const obtained = rows.reduce((total, row) => total + row.obtenidos, 0)
  const declared = rows.reduce((total, row) => total + row.declarados, 0)
  if (!obtained) return null
  const lowest = rows
    .filter((row) => row.coveragePct !== null && !row.overCount)
    .sort((a, b) => a.coveragePct - b.coveragePct)[0]
  return (
    <Headline
      value={formatNumber(obtained)}
      unit={`productos en la muestra, ${formatPct((obtained * 100) / declared, 0)} de lo que declaran las tiendas`}
      context={lowest ? `menor cobertura: ${verticalLabel(lowest.vertical)}, ${formatPct(lowest.coveragePct, 0)}` : undefined}
      tone="brand"
    />
  )
}

/** Titular menor: el concepto con más usuarios por ítem (mucha búsqueda, poco surtido). */
function AssortmentHeadline({ source }) {
  const rows = useAnalytics('assortment', source)
  if (!rows.length) return null
  const [top] = [...rows].sort((a, b) => b.usuarios_por_item - a.usuarios_por_item)
  return (
    <Headline
      value={formatNumber(top.usuarios_por_item, 1)}
      unit={`usuarios por ítem en ${top.concepto}, ${verticalLabel(top.vertical)}`}
      context={`${formatNumber(top.usuarios_que_buscan)} usuarios buscan y hay ${formatNumber(top.items_en_catalogo)} ítems`}
      size="minor"
    />
  )
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
  return (
    <div className="view">
      <section className="section" aria-labelledby="catalogo-real">
        <div className="section-head">
          <h2 id="catalogo-real">Salud del catálogo</h2>
          <p>
            Datos reales del scraper: productos obtenidos en la muestra frente a los que declaran los pasillos de las
            tiendas. La muestra trae hasta 24 productos por sub-pasillo, así que «no está» no significa «Rappi no lo
            vende».
          </p>
          <ProvenanceBadge kind="real" />
          <Async fallback={null}>
            <CoverageHeadline />
          </Async>
        </div>
        <div className="block coverage enter">
          <Async>
            <Coverage />
          </Async>
        </div>
        <div className="catalog-pair">
          <Card title="Calidad de los datos" subtitle="% de productos de cada vertical con el dato faltante." index={1}>
            <Async>
              <Quality />
            </Async>
          </Card>
          <Card title="Productos en varios verticales" subtitle="El mismo producto a la venta en 2 o más verticales." index={2}>
            <Async>
              <Cross />
            </Async>
          </Card>
        </div>
      </section>

      <section className="section" aria-labelledby="surtido">
        <div className="section-head">
          <h2 id="surtido">Dónde hay más interés que oferta</h2>
          <p>
            Ordenado por usuarios por ítem: arriba, conceptos con mucha búsqueda y poco surtido real. {DEMAND_NOTES[source]}
          </p>
          <ProvenanceBadge kind={`demand-${source}`} />
          <Async fallback={null}>
            <AssortmentHeadline source={source} />
          </Async>
        </div>
        <div className="block enter">
          <Async>
            <Assortment source={source} />
          </Async>
        </div>
      </section>
    </div>
  )
}
