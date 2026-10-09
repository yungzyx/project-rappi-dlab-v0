import { Icon } from './Icon.jsx'

// Procedencia de cada bloque. Lo simulado va rayado en ámbar; lo real, sólido. Nunca solo por color: siempre con texto.
const KINDS = {
  synthetic: { className: 'badge--simulated', icon: 'flask', label: 'Simulado' },
  prototype: { className: 'badge--prototype', icon: 'flask', label: 'Prototipo' },
  real: { className: 'badge--real', icon: 'check', label: 'Real · rappi.cl' },
  'demand-synthetic': { className: 'badge--simulated', icon: 'flask', label: 'Demanda simulada' },
  'demand-prototype': { className: 'badge--prototype', icon: 'flask', label: 'Demanda del prototipo' },
}

export function ProvenanceBadge({ kind }) {
  const { className, icon, label } = KINDS[kind]
  return (
    <span className={`badge ${className}`}>
      <Icon name={icon} />
      {label}
    </span>
  )
}
