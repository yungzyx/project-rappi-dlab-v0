const WEEK_MS = 7 * 86_400_000
/** Cohortes con menos usuarios que esto se muestran atenuadas: sus porcentajes saltan mucho. */
export const SMALL_COHORT = 20
/** Tramos de 10 puntos para la escala secuencial del mapa de calor (1 = menor retención, 6 = 50% o más). */
export const RETENTION_BINS = [10, 20, 30, 40, 50]

const utcDay = (iso) => {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

export function retentionBin(pct) {
  const index = RETENTION_BINS.findIndex((limit) => pct < limit)
  return index === -1 ? RETENTION_BINS.length + 1 : index + 1
}

/**
 * Arma la matriz cohorte × semana desde /analytics/cohorts (una fila por celda con datos).
 * La API omite las celdas donde nadie volvió: si esa semana ya pasó a la fecha de corte vale 0%;
 * si todavía no llega, queda en null (vacía).
 */
export function buildCohortMatrix(rows, asOfIso) {
  const maxWeek = Math.max(-1, ...rows.map((row) => row.semana))
  const weeks = Array.from({ length: maxWeek + 1 }, (_, week) => week)
  const byCohort = new Map()
  for (const row of rows) {
    if (!byCohort.has(row.cohorte)) byCohort.set(row.cohorte, { users: row.usuarios, values: new Map() })
    byCohort.get(row.cohorte).values.set(row.semana, row.retencion_pct)
  }
  const asOf = asOfIso ? utcDay(asOfIso) : null
  const cohorts = [...byCohort.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cohort, { users, values }]) => ({
      cohort,
      users,
      small: users < SMALL_COHORT,
      cells: weeks.map((week) => {
        if (values.has(week)) return values.get(week)
        const observed = asOf !== null && utcDay(cohort) + (week + 1) * WEEK_MS <= asOf + 86_400_000
        return observed ? 0 : null
      }),
    }))
  return { weeks, cohorts }
}
