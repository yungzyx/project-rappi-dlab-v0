import { render } from '@testing-library/react'
import { gameReady } from '../../game/testSeed.js'
import { GameProvider } from '../../state/GameContext'
import GameScreen from './GameScreen'

/** El juego como lo monta el prototipo, para las pruebas de pantallas (antes renderizaban el App del juego). */
export function GameApp({ params = {}, back = () => {}, push = () => {} }) {
  return (
    <GameProvider>
      <div className="phone">
        <GameScreen params={params} back={back} push={push} />
      </div>
    </GameProvider>
  )
}

/**
 * Monta el juego y espera a que cargue sus tarjetas y su progreso del servidor simulado (`stubApi`, con `seed()` para
 * el progreso): antes de eso solo se ve el aviso de carga.
 */
export async function mount(ui) {
  const result = render(ui)
  await gameReady()
  return result
}
