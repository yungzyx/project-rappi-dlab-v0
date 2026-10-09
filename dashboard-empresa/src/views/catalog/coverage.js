/**
 * Cobertura de la muestra pública por vertical: productos obtenidos / declarados por las tiendas.
 * `overCount` marca los verticales donde se obtuvieron más productos que los declarados: el conteo no calza
 * (p. ej. tiendas con doble etiqueta de vertical) y el % no se puede leer como cobertura.
 */
export function coverageRows(rows) {
  return rows.map((row) => ({
    ...row,
    coveragePct: row.declarados > 0 ? (row.obtenidos * 100) / row.declarados : null,
    overCount: row.declarados > 0 && row.obtenidos > row.declarados,
  }))
}

/** Productos presentes en 2 o más verticales (tiendas de un solo vertical), con el total. */
export function crossVerticalSummary(rows) {
  const sorted = [...rows].sort((a, b) => a.n_verticales - b.n_verticales)
  return { total: sorted.reduce((sum, row) => sum + row.productos, 0), rows: sorted }
}
