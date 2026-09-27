import { MODE_LABELS, useDemo } from '../state/DemoContext'
import './demo-toggle.css'

/** Interruptor "Rappi hoy / Propuesta" fuera del marco del teléfono (solo en notebook). */
export default function DemoToggle() {
  const demo = useDemo()

  return (
    <div className="demo-toggle" role="radiogroup" aria-label="Modo de la demo">
      {Object.entries(MODE_LABELS).map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={demo.mode === mode}
          className={demo.mode === mode ? 'is-active' : undefined}
          onClick={() => demo.setMode(mode)}
        >
          {label}
        </button>
      ))}
      <span className="demo-toggle-hint">Tecla D</span>
    </div>
  )
}
