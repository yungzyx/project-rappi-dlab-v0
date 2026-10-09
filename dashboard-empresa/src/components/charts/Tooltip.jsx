/** Tooltip de un gráfico: el valor manda y la etiqueta acompaña. Se voltea en la mitad derecha para no salirse. */
export function Tooltip({ x, y, containerWidth, value, label }) {
  const flip = x > containerWidth / 2
  return (
    <div
      className="chart-tooltip"
      role="status"
      style={{ left: x, top: y, '--shift': flip ? 'calc(-100% - 14px)' : '14px' }}
    >
      <strong className="num">{value}</strong>
      <span>{label}</span>
    </div>
  )
}
