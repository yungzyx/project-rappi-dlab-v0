import { barPath, scaleLinear } from './geometry.js'
import { useElementWidth } from './useElementWidth.js'

/** Barra horizontal de una fila. Los `segments` se dibujan superpuestos desde 0, el primero detrás. */
export function HBar({ domain, segments, height = 12 }) {
  const [ref, width] = useElementWidth()
  const x = scaleLinear(domain, [0, width])
  return (
    <div ref={ref} className="hbar" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} aria-hidden="true">
          {segments.map((segment) => (
            <path key={segment.className} className={segment.className} d={barPath(0, x(segment.value), 0, height)} />
          ))}
        </svg>
      )}
    </div>
  )
}
