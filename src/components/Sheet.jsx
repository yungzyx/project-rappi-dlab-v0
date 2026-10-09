import { X } from '@phosphor-icons/react'
import { useEffect, useRef } from 'react'
import './sheet.css'

/** Hoja inferior sobre la pantalla actual (un diálogo con nombre). */
export default function Sheet({ label, onClose, children }) {
  const ref = useRef(null)

  // Escape cierra y el foco entra a la hoja (demo en computador y lectores de pantalla).
  useEffect(() => {
    ref.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="sheet-close" aria-label="Cerrar" onClick={onClose}>
          <X size={20} weight="bold" aria-hidden="true" />
        </button>
        {children}
      </div>
    </div>
  )
}
