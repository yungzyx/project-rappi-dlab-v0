// Estratos y grupos de /analytics/multi-vertical. La API omite los grupos con menos de 20 usuarios.
export const STRATA = ['1–2 compras', '3–5 compras', '6+ compras']
export const GROUPS = [
  { key: 'multi-vertical', label: 'Multi-vertical', fill: 'fill-data', swatch: 'var(--data)' },
  { key: 'un vertical', label: 'Un vertical', fill: 'fill-deemph', swatch: 'var(--deemph)' },
]
export const MIN_GROUP_USERS = 20

/**
 * Una fila por estrato con ambos grupos (null si la API no lo trae) y la diferencia en puntos
 * (multi − un vertical) solo cuando existen los dos: sin grupo de comparación no hay diferencia.
 */
export function strataRows(rows) {
  return STRATA.map((stratum) => {
    const groups = GROUPS.map((group) => rows.find((row) => row.estrato === stratum && row.grupo === group.key) ?? null)
    const [multi, single] = groups
    return { stratum, groups, gap: multi && single ? multi.retencion_pct - single.retencion_pct : null }
  })
}
