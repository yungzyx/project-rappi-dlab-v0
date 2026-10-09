// Etapas de /analytics/funnel: sesiones que buscan → agregan al carro → inician pago → piden.
// `from` y `to` arman la frase de la mayor pérdida ("del carro al pago").
export const FUNNEL_STAGES = [
  { key: 'buscan', label: 'Buscan', from: 'de la búsqueda' },
  { key: 'agregan', label: 'Agregan al carro', from: 'del carro', to: 'al carro' },
  { key: 'pagan', label: 'Inician pago', from: 'del pago', to: 'al pago' },
  { key: 'piden', label: 'Piden', to: 'al pedido' },
]

const pct = (part, whole) => (whole > 0 ? (part * 100) / whole : null)

/**
 * Por vertical: cada etapa con su % sobre las que buscan (largo de barra) y su conversión desde la etapa anterior,
 * la conversión total y el paso donde más se pierde (null si ningún paso pierde sesiones).
 */
export function funnelRows(rows) {
  return rows.map((row) => {
    const top = row.buscan ?? 0
    const stages = FUNNEL_STAGES.map((stage, index) => {
      const count = row[stage.key] ?? 0
      const previous = index === 0 ? null : (row[FUNNEL_STAGES[index - 1].key] ?? 0)
      return {
        key: stage.key,
        label: stage.label,
        count,
        shareOfTop: pct(count, top),
        stepPct: previous === null ? null : pct(count, previous),
        from: index === 0 ? null : FUNNEL_STAGES[index - 1].from,
        to: stage.to,
      }
    })
    const lossy = stages.filter((stage) => stage.stepPct !== null && stage.stepPct < 100)
    const worst = lossy.reduce((min, stage) => (min && min.stepPct <= stage.stepPct ? min : stage), null)
    return {
      vertical: row.vertical,
      stages,
      overallPct: pct(row.piden ?? 0, top),
      worstStep: worst && { from: worst.from, to: worst.to, stepPct: worst.stepPct },
    }
  })
}
