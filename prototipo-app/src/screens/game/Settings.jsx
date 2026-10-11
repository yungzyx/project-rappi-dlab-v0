import { CaretLeft } from '@phosphor-icons/react'
import { useState } from 'react'
import { useGame } from '../../state/GameContext'
import './settings.css'

export default function Settings({ back, home }) {
  const { reset } = useGame()
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="game-screen">
      <header className="game-screen-head">
        <button type="button" className="icon-button" aria-label="Volver" onClick={back}>
          <CaretLeft size={22} aria-hidden="true" />
        </button>
        <h1>Ajustes</h1>
      </header>

      <section className="card settings-block">
        <h2 className="section-title">Tu progreso</h2>
        <p className="muted">
          Tu progreso se guarda en el servidor del prototipo con un identificador anónimo de este navegador. «Borrar mis
          datos», en Cuenta, lo borra.
        </p>
        {confirming ? (
          <div className="settings-confirm" role="group" aria-label="Confirmar reinicio">
            <p>
              Se borran tu nivel, tus sellos y tus cartas. Reiniciar no borra lo que ya enviamos (tus búsquedas y lo que
              hiciste en la app): eso se borra con «Borrar mis datos», en Cuenta. No se puede deshacer.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => {
                reset()
                home()
              }}
            >
              Sí, reiniciar
            </button>
            <button type="button" className="btn btn-secondary btn-block" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-secondary btn-block" onClick={() => setConfirming(true)}>
            Reiniciar progreso
          </button>
        )}
      </section>

      <section className="settings-about">
        <h2 className="section-title">Sobre este prototipo</h2>
        <p className="muted">
          Prototipo de prueba, independiente y no afiliado a Rappi. Los desafíos salen del catálogo público de Rappi
          Chile que sirve la API. No pedimos tu nombre ni tu correo.
        </p>
      </section>
    </div>
  )
}
