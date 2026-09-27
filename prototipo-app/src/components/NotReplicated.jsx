import './not-replicated.css'

/** Pestañas que existen en la app pero de las que aún no hay capturas. */
export default function NotReplicated({ title }) {
  return (
    <div className="screen not-replicated">
      <h1>{title}</h1>
      <p>Esta pantalla aún no está replicada.</p>
      <p className="not-replicated-hint">Mándame una captura y la agrego al prototipo.</p>
    </div>
  )
}
