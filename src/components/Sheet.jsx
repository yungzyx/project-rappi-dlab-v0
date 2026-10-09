import { X } from '@phosphor-icons/react'
import './sheet.css'

/** Hoja inferior sobre la pantalla actual (un diálogo con nombre). */
export default function Sheet({ label, onClose, children }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="sheet-close" aria-label="Cerrar" onClick={onClose}>
          <X size={20} weight="bold" aria-hidden="true" />
        </button>
        {children}
      </div>
    </div>
  )
}
