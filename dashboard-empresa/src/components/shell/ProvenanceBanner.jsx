import { API_URL } from '../../lib/api.js'
import { describeFallbacks, describeOrigins } from '../../lib/labels.js'
import { Icon } from '../Icon.jsx'

const MESSAGES = {
  synthetic: (
    <>
      <strong>Usuarios y eventos SIMULADOS:</strong> muestran la mecánica del panel, no evidencia. El catálogo sí es real
      (muestra pública de rappi.cl).
    </>
  ),
  prototype: (
    <>
      <strong>Usuarios y eventos del PROTOTIPO:</strong> pruebas hechas en la app de demostración, no clientes reales;
      con tan pocos datos varias métricas quedan vacías. El catálogo sí es real (muestra pública de rappi.cl).
    </>
  ),
}

/** Aviso permanente de procedencia (nunca se oculta) y, si alguna consulta cayó a los datos guardados, cuál y por qué. */
export function ProvenanceBanner({ source, fallbacks, onRetry }) {
  return (
    <div className="provenance" role="note" aria-label="Procedencia de los datos">
      <div className={`provenance-row provenance-row--${source}`}>
        <div className="container provenance-inner">
          <Icon name="flask" />
          <p>{MESSAGES[source]}</p>
        </div>
      </div>
      {fallbacks.length > 0 && (
        <div className="provenance-row provenance-row--offline" role="status">
          <div className="container provenance-inner">
            <Icon name="offline" />
            <p>
              <strong>Modo sin conexión (datos guardados):</strong> la API de rappi-ia en{' '}
              <span className="mono">{API_URL}</span> falló en {describeFallbacks(fallbacks)}. Esos bloques muestran
              respuestas guardadas en el repo ({describeOrigins(fallbacks)}).
            </p>
            <button type="button" className="link-button" onClick={onRetry}>
              Reintentar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
