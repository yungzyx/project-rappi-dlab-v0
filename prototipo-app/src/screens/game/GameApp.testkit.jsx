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
