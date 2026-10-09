import { BookOpen, House, IdentificationBadge, MapTrifold } from '@phosphor-icons/react'
import './bottom-nav.css'

const TABS = [
  { id: 'inicio', label: 'Inicio', Icon: House },
  { id: 'mapa', label: 'Mapa', Icon: MapTrifold },
  { id: 'pasaporte', label: 'Pasaporte', Icon: IdentificationBadge },
  { id: 'album', label: 'Álbum', Icon: BookOpen },
]

export default function BottomNav({ active, onSelect }) {
  return (
    <nav className="bottom-nav">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={id === active ? 'is-active' : ''}
          aria-current={id === active ? 'page' : undefined}
          onClick={() => onSelect(id)}
        >
          <Icon size={26} weight={id === active ? 'fill' : 'regular'} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
