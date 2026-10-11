/** Rótulo de procedencia de cada sección: lo del prototipo es uso de pocas personas; lo simulado, la mecánica del panel. */
export function SourceNote({ source }) {
  if (source === 'prototype') {
    return (
      <p className="card-note mvp-note">
        <strong>uso del MVP, pocas personas: no es evidencia</strong>
      </p>
    )
  }
  return (
    <p className="card-note mvp-note">
      <strong>Datos simulados:</strong> muestran la mecánica del panel, no son evidencia.
    </p>
  )
}
