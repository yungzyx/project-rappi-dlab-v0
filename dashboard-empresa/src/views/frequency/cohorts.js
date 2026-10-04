/** Cohortes con menos usuarios que esto se muestran atenuadas: sus porcentajes saltan mucho. */
export const SMALL_COHORT = 20
/** Tramos de 10 puntos para la escala secuencial del mapa de calor (1 = menor retención, 6 = 50% o más). */
export const RETENTION_BINS = [10, 20, 30, 40, 50]

export function retentionBin(pct) {
  const index = RETENTION_BINS.findIndex((limit) => pct < limit)
  return index === -1 ? RETENTION_BINS.length + 1 : index + 1
}

/**
 * Arma la matriz cohorte × semana desde /analytics/cohorts (una fila por semana terminada, también las de 0%).
 * Una semana sin fila después de la última que trae la cohorte queda en null (vacía): la API todavía no la da por
 * terminada, aunque la fecha de corte caiga en domingo. Un hueco entre semanas con fila vale 0% (nadie volvió).
 */
export function buildCohortMatrix(rows) {
  const maxWeek = Math.max(-1, ...rows.map((row) => row.semana))
  const weeks = Array.from({ length: maxWeek + 1 }, (_, week) => week)
  const byCohort = new Map()
  for (const row of rows) {
    if (!byCohort.has(row.cohorte)) byCohort.set(row.cohorte, { users: row.usuarios, values: new Map() })
    byCohort.get(row.cohorte).values.set(row.semana, row.retencion_pct)
  }
  const cohorts = [...byCohort.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cohort, { users, values }]) => {
      const lastWeek = Math.max(...values.keys())
      return {
        cohort,
        users,
        small: users < SMALL_COHORT,
        cells: weeks.map((week) => (values.has(week) ? values.get(week) : week < lastWeek ? 0 : null)),
      }
    })
  return { weeks, cohorts }
}
