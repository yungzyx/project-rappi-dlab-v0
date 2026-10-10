import { useEffect, useState } from 'react'
import { API_URL, checkConnection } from '../api/client'
import Mascot from './assistant/Mascot'
import './connection-gate.css'

/**
 * Sin la API no hay Mochi, y la app no arranca con reglas locales: antes de montar `children` revisa la API
 * (al montar y con cada «Reintentar»). Mientras revisa o sin conexión no se monta la app, así que ningún
 * contexto llama a la API. Una vez dentro, la app sigue sola: sus propios errores de red los maneja ella.
 */
export default function ConnectionGate({ children }) {
  const [status, setStatus] = useState('checking') // 'checking' | 'online' | 'offline'
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    checkConnection().then((result) => {
      if (current) setStatus(result.ok ? 'online' : 'offline')
    })
    return () => {
      current = false
    }
  }, [attempt])

  const retry = () => {
    setStatus('checking')
    setAttempt((n) => n + 1)
  }

  if (status === 'online') return children

  return (
    <main className="connection-gate">
      <div className="connection-card">
        <Mascot size={96} mood="think" />
        {status === 'checking' ? (
          <p className="connection-checking" role="status">
            Conectando con Mochi…
          </p>
        ) : (
          <>
            <h1>Sin conexión con Mochi</h1>
            <p>No pude conectar con la API del MVP ({API_URL}).</p>
            <p className="connection-help">
              Levanta el MVP con <code>make mvp</code> en la carpeta del proyecto y vuelve a intentar.
            </p>
            <button type="button" className="connection-retry tap" onClick={retry}>
              Reintentar
            </button>
          </>
        )}
      </div>
    </main>
  )
}
