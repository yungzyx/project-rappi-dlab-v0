import { useId } from 'react'
import './mascot.css'

const MUSTACHE =
  'M60 70C54 64 42 63 36 68C31 72 27 72 24 69C25 77 33 82 42 80C50 79 56 76 60 74C64 76 70 79 78 80C87 82 95 77 96 69C93 72 89 72 84 68C78 63 66 64 60 70Z'

/**
 * Mascota del asistente: la mochila Rappi con bigote, en estilo 3D "de arcilla" (sombras suaves y mejillas rosadas).
 * mood: 'idle' | 'wave' | 'listen' | 'think' | 'talk'. `badge` la pone en un círculo rosado, como un avatar.
 */
export default function Mascot({ size = 56, mood = 'idle', badge = false, className = '' }) {
  const id = useId().replace(/:/g, '')
  const g = (name) => `${name}-${id}`
  const url = (name) => `url(#${g(name)})`

  return (
    <svg
      className={`mascot mascot--${mood} ${className}`}
      width={size}
      height={size * (badge ? 1 : 1.2)}
      viewBox={badge ? '0 0 120 120' : '0 0 120 144'}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={g('body')} cx="0.34" cy="0.22" r="0.9">
          <stop offset="0" stopColor="#ffab85" />
          <stop offset="0.45" stopColor="#ff7a4a" />
          <stop offset="1" stopColor="#e5502a" />
        </radialGradient>
        <linearGradient id={g('shade')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.55" stopColor="#a8300c" stopOpacity="0" />
          <stop offset="1" stopColor="#a8300c" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id={g('band')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1f2f4" />
          <stop offset="1" stopColor="#b8bec6" />
        </linearGradient>
        <radialGradient id={g('eye')} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0.6" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e8e1de" />
        </radialGradient>
        <linearGradient id={g('stache')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d64a1c" />
          <stop offset="1" stopColor="#9c2b0c" />
        </linearGradient>
        <linearGradient id={g('leg')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5cbd6f" />
          <stop offset="1" stopColor="#2f8a48" />
        </linearGradient>
        <radialGradient id={g('bg')} cx="0.5" cy="0.4" r="0.6">
          <stop offset="0" stopColor="#ffece8" />
          <stop offset="1" stopColor="#fbd5ce" />
        </radialGradient>
        <clipPath id={g('bodyclip')}>
          <rect x="14" y="14" width="92" height="96" rx="24" />
        </clipPath>
        {/* En modo avatar la mascota se corta en el borde inferior del círculo, como los personajes */}
        <clipPath id={g('badgeclip')}>
          <rect x="0" y="-20" width="120" height="84" />
          <circle cx="60" cy="62" r="54" />
        </clipPath>
      </defs>

      {badge && <circle cx="60" cy="62" r="56" fill={url('bg')} stroke="#fff4f1" strokeWidth="4" />}

      <g className="mascot-figure" clipPath={badge ? url('badgeclip') : undefined}>
        <g transform={badge ? 'translate(4 6) scale(0.93)' : undefined}>
          {!badge && <ellipse cx="60" cy="140" rx="30" ry="4" fill="#000" opacity="0.1" />}

          {/* Piernas verdes con rayo y zapatos naranjos, como la mascota real (en el avatar quedan fuera del círculo) */}
          {!badge && (
            <>
              <rect x="40" y="100" width="15" height="32" rx="7.5" fill={url('leg')} />
              <rect x="65" y="100" width="15" height="32" rx="7.5" fill={url('leg')} />
              <path d="M48 113l-3 5h3l-2 5 5-7h-3l2-3z" fill="#fff" opacity="0.9" />
              <path d="M73 113l-3 5h3l-2 5 5-7h-3l2-3z" fill="#fff" opacity="0.9" />
              <ellipse cx="46" cy="133" rx="12" ry="7" fill={url('body')} />
              <ellipse cx="74" cy="133" rx="12" ry="7" fill={url('body')} />
            </>
          )}

          {/* Brazos: el izquierdo quieto (en la Home de «Bigotes vivo» apunta), el derecho saluda */}
          <g className="mascot-arm-left">
            <ellipse cx="12" cy="60" rx="8" ry="11" transform="rotate(-18 12 60)" fill={url('body')} />
            <ellipse cx="7" cy="55" rx="3" ry="4.5" transform="rotate(-40 7 55)" fill="#ff8a5c" />
          </g>
          <g className="mascot-arm">
            <ellipse cx="108" cy="60" rx="8" ry="11" transform="rotate(18 108 60)" fill={url('body')} />
            <ellipse cx="113" cy="55" rx="3" ry="4.5" transform="rotate(40 113 55)" fill="#ff8a5c" />
          </g>

          {/* Asa y cuerpo de la mochila */}
          <path
            d="M46 16v-5a6 6 0 0 1 6-6h16a6 6 0 0 1 6 6v5"
            fill="none"
            stroke="#c9471f"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <rect x="14" y="14" width="92" height="96" rx="24" fill={url('body')} />
          <g clipPath={url('bodyclip')}>
            <rect x="14" y="26" width="92" height="6" fill={url('band')} />
            <rect x="14" y="92" width="92" height="6" fill={url('band')} />
            <rect x="14" y="14" width="92" height="96" fill={url('shade')} />
          </g>
          <ellipse cx="38" cy="21" rx="16" ry="4" fill="#fff" opacity="0.35" />

          {/* Cara */}
          <ellipse cx="28" cy="71" rx="7" ry="4" fill="#ff5f6d" opacity="0.3" />
          <ellipse cx="92" cy="71" rx="7" ry="4" fill="#ff5f6d" opacity="0.3" />
          <g className="mascot-eyes">
            {[45, 75].map((cx) => (
              <g key={cx} className="mascot-eye">
                <circle cx={cx} cy="52" r="13" fill={url('eye')} />
                <g className="mascot-pupil">
                  <circle cx={cx + (cx < 60 ? 2 : -2)} cy="53" r="6.5" fill="#2b1d18" />
                  <circle cx={cx + (cx < 60 ? 0 : -4)} cy="50.5" r="2.2" fill="#fff" />
                </g>
              </g>
            ))}
          </g>
          <g className="mascot-mouth">
            <path d="M54 80Q60 91 66 80Z" fill="#6e2418" />
            <ellipse cx="60" cy="85" rx="3.5" ry="2" fill="#ff8a80" />
          </g>
          <g className="mascot-mustache">
            {/* Sombra suave bajo el bigote para que se despegue del cuerpo */}
            <path d={MUSTACHE} fill="#7a1f06" opacity="0.22" transform="translate(-6 -4.2) scale(1.1)" />
            <path d={MUSTACHE} fill={url('stache')} transform="translate(-6 -6.4) scale(1.1)" />
            <path
              d="M39 69c5-3 12-3 17 0M64 69c5-3 12-3 17 0"
              fill="none"
              stroke="#ffb08a"
              strokeOpacity="0.55"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </g>
          {/* Bigote de marca pequeño en el cuerpo, como en la ropa de los personajes */}
          <path d={MUSTACHE} fill="#ffe2d4" opacity="0.9" transform="translate(47.4 88.5) scale(0.21)" />
        </g>
      </g>
    </svg>
  )
}
