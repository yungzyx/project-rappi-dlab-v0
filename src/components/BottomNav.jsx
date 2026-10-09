import { Cards, GameController, IdentificationBadge } from '@phosphor-icons/react'
import './bottom-nav.css'

const TABS = [
  { id: 'jugar', label: 'Jugar', Icon: GameController },
  { id: 'pasaporte', label: 'Pasaporte', Icon: IdentificationBadge },
  { id: 'album', label: 'Álbum', Icon: Cards },
]

export default function BottomNav({ active, onSelect, badges = {} }) {
  return (
    <nav className="bottom-nav">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={id === active ? 'is-active' : ''}
          aria-current={id === active ? 'page' : undefined}
          aria-label={
            badges[id] > 0
              ? `${label}, ${badges[id]} ${badges[id] === 1 ? 'carta sin leer' : 'cartas sin leer'}`
              : undefined
          }
          onClick={() => onSelect(id)}
        >
          <span className="nav-icon">
            <Icon size={28} weight={id === active ? 'fill' : 'regular'} aria-hidden="true" />
            {badges[id] > 0 && (
              <span
                className="nav-badge"
                aria-label={`${badges[id]} ${badges[id] === 1 ? 'carta sin leer' : 'cartas sin leer'}`}
              >
                {badges[id]}
              </span>
            )}
          </span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
