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

/** Si el bloque se muestra con una respuesta guardada, de dónde salió y de qué día (`saved` = `{ origen, fecha }`). */
export function SavedNote({ saved }) {
  if (!saved) return null
  return (
    <p className="card-note mvp-note">
      Guardado sin conexión: {saved.origen} ({saved.fecha}).
    </p>
  )
}
