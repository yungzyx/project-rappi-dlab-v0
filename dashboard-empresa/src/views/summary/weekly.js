import { formatNumber, formatPct, formatPoints, formatSignedPct } from '../../lib/format.js'

const DAY_MS = 86_400_000
export const COMPARE_WEEKS = 4

/** Series de /analytics/weekly. Las tasas se comparan en puntos porcentuales; los conteos, en %. */
export const WEEKLY_SERIES = [
  { key: 'usuarios_activos', title: 'Usuarios activos', unit: 'en la semana', format: formatNumber, goodWhen: 'up' },
  { key: 'pedidos', title: 'Pedidos', unit: 'en la semana', format: formatNumber, goodWhen: 'up' },
  {
    key: 'abandono_carrito_pct',
    title: 'Abandono de carrito',
    unit: 'de los carros de la semana',
    format: formatPct,
    goodWhen: 'down',
    rate: true,
  },
  {
    key: 'sin_resultado_pct',
    title: 'Búsquedas sin resultado',
    unit: 'de búsquedas y chats',
    format: formatPct,
    goodWhen: 'down',
    rate: true,
  },
]

const utcDay = (iso) => {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

/** La semana (que empieza el lunes `weekIso`) no terminó a la fecha de corte `asOfIso`. */
export function isPartialWeek(weekIso, asOfIso) {
  if (!asOfIso) return false
  return utcDay(asOfIso) < utcDay(weekIso) + 6 * DAY_MS
}

/**
 * Puntos de una serie y su cambio: última semana completa contra la de 4 semanas antes.
 * Devuelve { points, latest, change, formatChange }; `change` es null si no hay con qué comparar.
 */
export function weeklySeries(rows, series, asOfIso) {
  const points = rows.map((row) => ({
    date: row.semana,
    value: row[series.key] ?? null,
    partial: isPartialWeek(row.semana, asOfIso),
  }))
  const complete = points.filter((point) => !point.partial && point.value !== null)
  const latest = complete.at(-1) ?? null
  const base = complete.length > COMPARE_WEEKS ? complete.at(-1 - COMPARE_WEEKS) : null
  let change = null
  if (latest && base) {
    change = series.rate ? latest.value - base.value : base.value > 0 ? ((latest.value - base.value) / base.value) * 100 : null
  }
  return { points, latest, change, formatChange: series.rate ? formatPoints : formatSignedPct }
}
