// Escalas y formas de las marcas (skill dataviz: extremo de datos redondeado 4 px, base recta).
const RADIUS = 4

/** Paso "redondo" (1, 2, 2,5 o 5 × 10^n) que cubre `raw`. */
export function niceStep(raw, { integer = false } = {}) {
  if (!(raw > 0)) return 1
  const power = 10 ** Math.floor(Math.log10(raw))
  // Conteos (pedidos, usuarios): sin pasos fraccionarios ("0,25 pedidos") ni de 2,5.
  const factors = integer ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10]
  const factor = factors.find((candidate) => candidate * power >= raw - 1e-9)
  return integer ? Math.max(1, factor * power) : factor * power
}

/** Marcas del eje desde 0 hasta un máximo redondo que cubre `max`. */
export function niceTicks(max, count = 4, { integer = false } = {}) {
  const step = niceStep(max / count, { integer })
  const top = Math.max(step, Math.ceil(max / step - 1e-9) * step)
  const ticks = []
  for (let index = 0; index * step <= top + 1e-9; index += 1) ticks.push(Number((index * step).toFixed(6)))
  return ticks
}

export function scaleLinear([d0, d1], [r0, r1]) {
  return (value) => (d1 === d0 ? r0 : r0 + ((value - d0) / (d1 - d0)) * (r1 - r0))
}

/** Barra horizontal desde la base `x0` hasta el dato `x1` (puede ir hacia la izquierda). */
export function barPath(x0, x1, top, height) {
  const width = Math.abs(x1 - x0)
  if (width < 0.5) return ''
  const r = Math.min(RADIUS, width, height / 2)
  const dir = x1 >= x0 ? 1 : -1
  const bottom = top + height
  return (
    `M${x0},${top}H${x1 - dir * r}Q${x1},${top} ${x1},${top + r}` +
    `V${bottom - r}Q${x1},${bottom} ${x1 - dir * r},${bottom}H${x0}Z`
  )
}

/** Columna desde la base `y0` (abajo) hasta el dato `y1`. */
export function columnPath(x, width, y0, y1) {
  const height = y0 - y1
  if (height < 0.5) return ''
  const r = Math.min(RADIUS, height, width / 2)
  return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + width - r}Q${x + width},${y1} ${x + width},${y1 + r}V${y0}Z`
}
