import {
  Basket,
  Cookie,
  FirstAidKit,
  ForkKnife,
  Lightning,
  ShoppingBag,
  Star,
  Storefront,
  Wine,
} from '@phosphor-icons/react'
import './stamp.css'

export const ICONS = {
  supermercado: Basket,
  conveniencia: Storefront,
  turbo: Lightning,
  licores: Wine,
  chocolateria: Cookie,
  restaurantes: ForkKnife,
  farmacia: FirstAidKit,
  mall: ShoppingBag,
}

export const LEVEL_NAMES = {
  ninguno: 'Sin sello',
  explorador: 'Explorador',
  conocedor: 'Conocedor',
  experto: 'Experto',
}

const STARS = { ninguno: 0, explorador: 1, conocedor: 2, experto: 3 }

/** Sello de una vertical: su ícono en su color, con 0 a 3 estrellas según el nivel. */
export default function Stamp({ vertical, level, size = 72, animate = false }) {
  const Icon = ICONS[vertical]
  const earned = level !== 'ninguno'
  return (
    <span
      className={`stamp ${earned ? 'is-earned' : ''} ${animate ? 'is-new' : ''}`}
      style={{ '--stamp-color': `var(--v-${vertical})`, '--stamp-size': `${size}px` }}
      aria-hidden="true"
    >
      <Icon size={size * 0.46} weight={earned ? 'fill' : 'regular'} />
      <span className="stamp-stars">
        {[0, 1, 2].map((i) => (
          <Star key={i} size={size * 0.17} weight={i < STARS[level] ? 'fill' : 'regular'} />
        ))}
      </span>
    </span>
  )
}
