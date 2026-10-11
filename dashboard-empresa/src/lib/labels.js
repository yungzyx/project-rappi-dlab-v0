// Nombres visibles de los códigos que entrega el backend.
const VERTICALS = {
  supermercado: 'Supermercado',
  conveniencia: 'Conveniencia',
  turbo: 'Turbo',
  licores: 'Licores',
  mall: 'Rappi Mall',
  farmacia: 'Farmacia',
  chocolateria: 'Chocolatería',
  restaurantes: 'Restaurantes',
  viajes: 'Viajes', // vertical del juego, sin catálogo
}

export const verticalLabel = (code) => VERTICALS[code] ?? code

export const SOURCE_LABELS = { synthetic: 'Simulados', prototype: 'Prototipo' }

/** Nombre de una demanda no satisfecha: el concepto (con emoji) o, si no hay concepto, la consulta literal. */
export function demandLabel(row) {
  if (row.concept_id) return row.que
  return row.que == null ? 'Consulta borrada (más de 90 días)' : `«${row.que}»`
}

/** Nombre visible de cada consulta de /analytics (para el aviso de modo sin conexión). */
const ENDPOINTS = {
  kpis: 'indicadores',
  weekly: 'serie semanal',
  opportunities: 'demanda no satisfecha',
  trends: 'tendencias',
  funnel: 'embudo',
  cohorts: 'cohortes',
  rhythm: 'ritmo de compra',
  'at-risk': 'usuarios en riesgo',
  suggestions: 'sugerencias',
  'multi-vertical': 'retención multi-vertical',
  affinity: 'afinidad',
  assortment: 'surtido vs demanda',
  catalog: 'catálogo',
  services: 'servicios sin catálogo',
  offers: 'ofertas por momento',
  game: 'juego',
  unmet: 'búsquedas sin resultado',
}

const MAX_LISTED = 3

function joinList(items) {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`
}

/** "serie semanal (no respondió en 30 s)" · "indicadores, tendencias y 4 más (no responde)". */
export function describeFallbacks(fallbacks) {
  const names = fallbacks.map((fallback) => ENDPOINTS[fallback.name] ?? fallback.name)
  const listed =
    names.length > MAX_LISTED ? [...names.slice(0, MAX_LISTED - 1), `${names.length - MAX_LISTED + 1} más`] : names
  const reasons = [...new Set(fallbacks.map((fallback) => fallback.reason))]
  return `${joinList(listed)} (${reasons.join('; ')})`
}

/** "1 tienda", "8 tiendas". */
export const plural = (count, singular, pluralForm = `${singular}s`) => (count === 1 ? singular : pluralForm)

/** Estados que devuelve /analytics/at-risk (regla de riesgo de docs/diseno-ia.md §5). */
export const RISK_STATUS = {
  perdido: { label: 'Perdido', tone: 'bad' },
  en_riesgo: { label: 'En riesgo', tone: 'warn' },
}

/** "simulación (2026-10-09) y muestra pública (2026-10-09)": de dónde salen las respuestas guardadas, sin repetir. */
export function describeOrigins(fallbacks) {
  const origins = fallbacks.map((fallback) =>
    fallback.guardado ? `${fallback.guardado.origen} (${fallback.guardado.fecha})` : 'origen sin registrar',
  )
  return joinList([...new Set(origins)])
}
