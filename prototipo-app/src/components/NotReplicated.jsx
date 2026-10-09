import './not-replicated.css'

/** Pestañas que existen en la app pero que el prototipo no cubre. */
export default function NotReplicated({ title }) {
  return (
    <div className="screen not-replicated">
      <h1>{title}</h1>
      <p>Esta sección no está en el prototipo.</p>
    </div>
  )
}
