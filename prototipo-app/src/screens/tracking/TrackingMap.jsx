import { useId } from 'react'
import mochiPoses from '../../assets/mochi-poses.webp'
import { ROUTE, pointOnRoute } from './progress'

const ROUTE_PATH = ROUTE.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')
const MARKER = 40
const POSE_OVERFLOW = MARKER * 0.07 // como el avatar de Mochi: la pose asoma un poco del círculo

/** Mapa ilustrado (no es un mapa real): cuadras, parque, río, la ruta y Mochi avanzando por ella. */
export default function TrackingMap({ progress, delivered }) {
  const [x, y] = pointOnRoute(progress)
  const [homeX, homeY] = ROUTE[ROUTE.length - 1]
  const [storeX, storeY] = ROUTE[0]
  const badgeFill = `mochi-badge-${useId().replace(/:/g, '')}`

  return (
    <svg
      className="tracking-map"
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      aria-label="Mapa del pedido"
    >
      <rect width="400" height="300" fill="#eef1ec" />
      <path d="M0 262 C90 250 160 285 260 268 S380 250 400 258 V300 H0 Z" fill="#cfe4f3" />
      <circle cx="262" cy="200" r="46" fill="#d6ecd0" />
      {/* Cuadras */}
      {[
        [8, 8, 40, 140],
        [86, 8, 78, 146],
        [86, 186, 78, 62],
        [194, 8, 114, 78],
        [194, 118, 40, 60],
        [340, 8, 52, 78],
        [340, 118, 52, 120],
      ].map(([bx, by, bw, bh]) => (
        <rect key={`${bx}-${by}`} x={bx} y={by} width={bw} height={bh} rx="8" fill="#e2e6df" />
      ))}
      {/* Calles */}
      <path d="M62 0V300M178 0V260M322 0V250M0 168H400M0 100H400M0 236H200" stroke="#fff" strokeWidth="14" />

      <path d={ROUTE_PATH} fill="none" stroke="#ffcdb8" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path
        className="tracking-route"
        d={ROUTE_PATH}
        fill="none"
        stroke="var(--bigotes-orange)"
        strokeWidth="4"
        strokeDasharray="2 9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <g transform={`translate(${storeX} ${storeY})`}>
        <circle r="13" fill="#fff" stroke="var(--bigotes-orange)" strokeWidth="3" />
        <path
          d="M-4 -6v5a3 3 0 0 0 6 0v-5M-1 -6v12M5 -6c-2 0-3 2-3 5v1h3v6"
          fill="none"
          stroke="var(--bigotes-orange)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </g>
      <g
        transform={`translate(${homeX} ${homeY})`}
        className={delivered ? 'tracking-home is-arrived' : 'tracking-home'}
      >
        <circle r="15" fill="#1f1f1f" />
        <path d="M-7 1 0 -6 7 1V8H-7Z" fill="#fff" />
      </g>

      {/* Mochi como repartidor: la transición CSS suaviza el salto entre ticks. Va en SVG puro (no el componente,
          que es HTML): Safari dibuja mal el HTML animado dentro de un foreignObject. Frontal en camino, feliz al llegar. */}
      <g className="tracking-rider" style={{ transform: `translate(${x - MARKER / 2}px, ${y - MARKER / 2 - 8}px)` }}>
        <ellipse cx={MARKER / 2} cy={MARKER + 4} rx="12" ry="3" fill="#000" opacity="0.15" />
        <radialGradient id={badgeFill} cx="0.45" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#fff7ee" />
          <stop offset="1" stopColor="#ffe2ce" />
        </radialGradient>
        <circle cx={MARKER / 2} cy={MARKER / 2} r={MARKER / 2 - 1} fill={`url(#${badgeFill})`} stroke="#fff4eb" strokeWidth="2" />
        <svg
          x={-POSE_OVERFLOW}
          y={-POSE_OVERFLOW}
          width={MARKER + 2 * POSE_OVERFLOW}
          height={MARKER + 2 * POSE_OVERFLOW}
          viewBox="0 0 1 1"
          overflow="hidden"
        >
          {/* La imagen tiene 2 × 2 poses: se corre para que quede a la vista la de arriba a la izquierda o a la derecha */}
          <image href={mochiPoses} x={delivered ? -1 : 0} y="0" width="2" height="2" preserveAspectRatio="none" />
        </svg>
      </g>
    </svg>
  )
}
