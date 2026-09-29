import { formatNumber, formatSignedPct } from '../../lib/format.js'
import { demandLabel, verticalLabel } from '../../lib/labels.js'

// Palancas de docs/diseno-ia.md §5 ("Palancas que salen de estos datos").
const TREND_ACTION = 'Ocasiones y recompra: campaña con horario y «¿Repetimos?» en su ciclo de compra.'
const RISK_ACTION =
  'Reactivación por ritmo: mensaje con su concepto top y una novedad del vertical, solo con consentimiento; al resto, Bigotes en la app.'

function growthText(row) {
  if (row.recientes === 0) return 'sin búsquedas en las últimas 4 semanas'
  const pct = row.crecimiento_pct
  return pct === null || pct === undefined ? 'nueva: no aparecía en las 4 semanas anteriores' : `${formatSignedPct(pct)} vs las 4 semanas anteriores`
}

function topOpportunity(opportunities) {
  const [top] = [...opportunities].sort((a, b) => b.usuarios - a.usuarios)
  if (!top) return null
  return {
    id: 'oportunidad',
    kind: 'Demanda no satisfecha',
    figure: formatNumber(top.usuarios),
    unit: 'usuarios lo buscaron sin resultado',
    title: `${demandLabel(top)} en ${verticalLabel(top.vertical)}`,
    detail: `${formatNumber(top.busquedas)} búsquedas · ${growthText(top)}`,
    action: top.accion,
    view: 'oportunidades',
    linkLabel: 'Ver oportunidades',
    concept: top.concept_id,
  }
}

/**
 * Concepto que más sube. Se prefiere uno que SÍ tiene oferta (se puede empujar hoy); si todos los que suben
 * son demanda no satisfecha, el que sigue a la oportunidad ya elegida.
 */
function topRisingTrend(trends, opportunities, chosenConcept) {
  const unmet = new Set(opportunities.map((row) => row.concept_id).filter(Boolean))
  const rising = trends.filter((row) => row.crecimiento_pct > 0).sort((a, b) => b.crecimiento_pct - a.crecimiento_pct)
  const trend =
    rising.find((row) => !unmet.has(row.concept_id)) ?? rising.find((row) => row.concept_id !== chosenConcept)
  if (!trend) return null
  return {
    id: 'tendencia',
    kind: 'Concepto que sube',
    figure: formatSignedPct(trend.crecimiento_pct),
    unit: 'de interés en 4 semanas',
    title: trend.concepto,
    detail: `${formatNumber(trend.recientes)} señales de interés (búsquedas, chat y carro) vs ${formatNumber(trend.anteriores)}`,
    action: TREND_ACTION,
    view: 'oportunidades',
    linkLabel: 'Ver tendencias',
  }
}

function atRisk(kpis) {
  if (!(kpis?.en_riesgo > 0)) return null
  return {
    id: 'riesgo',
    kind: 'Usuarios en riesgo',
    figure: formatNumber(kpis.en_riesgo),
    unit: 'usuarios en riesgo según su propio ritmo',
    title: 'Todavía se pueden recuperar',
    detail: `Además hay ${formatNumber(kpis.perdidos)} perdidos (más de 3 veces su ritmo sin pedir).`,
    action: RISK_ACTION,
    view: 'frecuencia',
    linkLabel: 'Ver usuarios en riesgo',
  }
}

/** Lo que va en "Qué hacer esta semana": la oportunidad top, el concepto que más sube y los usuarios en riesgo. */
export function pickActions({ opportunities = [], trends = [], kpis = null }) {
  const opportunity = topOpportunity(opportunities)
  return [opportunity, topRisingTrend(trends, opportunities, opportunity?.concept), atRisk(kpis)].filter(Boolean)
}
