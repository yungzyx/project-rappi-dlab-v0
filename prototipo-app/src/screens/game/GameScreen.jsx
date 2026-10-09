import { CaretLeft } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { routeForScreen } from '../../data/verticals'
import { nextVertical } from '../../game/progress.js'
import { GAME_TO_SCREEN } from '../../game/verticals.js'
import { useGame } from '../../state/GameContext'
import Album from './Album.jsx'
import Concept from './Concept.jsx'
import BottomNav from './GameTabs.jsx'
import Toast from './GameToast.jsx'
import Intro from './Intro.jsx'
import OrderBanner from './OrderBanner.jsx'
import Passport from './Passport.jsx'
import Path from './Path.jsx'
import Round from './Round.jsx'
import Settings from './Settings.jsx'
import Vertical from './Vertical.jsx'
import { GameShellContext } from './gameShell'
import './game-tokens.css'
import './game-base.css'

const TABS = ['jugar', 'pasaporte', 'album']

/** Pantalla con la que abre el juego: una ronda directa, la hoja de una vertical o una pestaña. */
function firstScreen({ tab, vertical, round, orderId }) {
  if (round) return { name: 'ronda', params: { vertical: round, orderId } }
  if (vertical) return { name: 'jugar', params: { open: vertical } }
  return { name: TABS.includes(tab) ? tab : 'jugar', params: {} }
}

/**
 * El juego de verticales dentro del prototipo: su propia pila de pantallas (la pestaña es la base) y una barra arriba
 * para volver a la app. `params`: `{ tab, vertical, round, orderId }` (ids del juego; `orderId` muestra la franja del
 * pedido que se espera); salir de la base vuelve con `back`.
 */
export default function GameScreen({ back, push, params = {} }) {
  const game = useGame()
  const [stack, setStack] = useState(() => [firstScreen(params)])
  const current = stack.at(-1)
  const tab = stack[0].name

  const go = (name, next = {}) => setStack((s) => [...s, { name, params: next }])
  const goBack = () => (stack.length > 1 ? setStack((s) => s.slice(0, -1)) : back())
  const switchTab = (name) => setStack([{ name, params: {} }])
  const nav = { go, back: goBack, home: () => switchTab('jugar'), switchTab }

  const shell = useMemo(
    () => ({
      openInApp: (vertical) => {
        const id = GAME_TO_SCREEN[vertical]
        game.visit(id)
        push(...routeForScreen(id))
      },
    }),
    [game, push],
  )

  const unread = game.state.cards.filter((id) => !game.state.opened.includes(id)).length
  const inRound = current.name === 'ronda'

  let screen
  switch (current.name) {
    case 'pasaporte':
      screen = <Passport {...nav} />
      break
    case 'album':
      screen = <Album {...nav} />
      break
    case 'ajustes':
      screen = <Settings {...nav} />
      break
    case 'coleccion':
      screen = <Vertical {...nav} {...current.params} />
      break
    case 'concepto':
      screen = <Concept {...nav} {...current.params} />
      break
    case 'ronda':
      screen = <Round {...nav} {...current.params} />
      break
    default:
      screen = <Path {...nav} {...current.params} />
  }

  return (
    <GameShellContext.Provider value={shell}>
      <div className={`game${inRound ? ' is-round' : ''}${params.orderId ? ' has-order' : ''}`}>
        {!inRound && (
          <header className="game-header">
            <button type="button" className="game-header-back" aria-label="Volver a Rappi" onClick={back}>
              <CaretLeft size={22} weight="bold" />
            </button>
            <span>Juego de verticales</span>
          </header>
        )}
        {params.orderId && <OrderBanner orderId={params.orderId} onOpenOrder={back} />}
        <main key={stack.length + current.name}>{screen}</main>
        {!inRound && (
          <BottomNav active={TABS.includes(tab) ? tab : 'jugar'} onSelect={switchTab} badges={{ album: unread }} />
        )}
        {/* La ronda celebra sus propios logros al final: los avisos globales quedan para el resto. */}
        {!inRound && game.events.length > 0 && <Toast event={game.events[0]} onClose={game.dismissEvent} />}
        {!game.state.seenIntro && current.name === 'jugar' && (
          <Intro
            onStart={() => {
              game.seeIntro()
              go('ronda', { vertical: nextVertical(game.state) })
            }}
            onClose={game.seeIntro}
          />
        )}
      </div>
    </GameShellContext.Provider>
  )
}
