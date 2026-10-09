import { useState } from 'react'
import BottomNav from './components/BottomNav.jsx'
import Intro from './components/Intro.jsx'
import StatusBar from './components/StatusBar.jsx'
import Toast from './components/Toast.jsx'
import { nextVertical } from './game/progress.js'
import Album from './screens/Album.jsx'
import Concept from './screens/Concept.jsx'
import Passport from './screens/Passport.jsx'
import Path from './screens/Path.jsx'
import Round from './screens/Round.jsx'
import Settings from './screens/Settings.jsx'
import Vertical from './screens/Vertical.jsx'
import { GameProvider, useGame } from './state/GameContext.jsx'
import './styles/tokens.css'
import './styles/global.css'

const TABS = ['jugar', 'pasaporte', 'album']

/** Navegación con una pila de pantallas: la pestaña es la base y lo demás se apila encima. */
function Game() {
  const game = useGame()
  const [stack, setStack] = useState([{ name: 'jugar', params: {} }])
  const current = stack.at(-1)
  const tab = stack[0].name

  const go = (name, params = {}) => setStack((s) => [...s, { name, params }])
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))
  const switchTab = (name) => setStack([{ name, params: {} }])
  const nav = { go, back, home: () => switchTab('jugar'), switchTab }

  const unread = game.state.cards.filter((id) => !game.state.opened.includes(id)).length

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
      screen = <Path {...nav} />
  }

  return (
    <div className="stage">
      <div className="phone">
        <StatusBar />
        <main key={stack.length + current.name}>{screen}</main>
        {current.name !== 'ronda' && (
          <BottomNav active={TABS.includes(tab) ? tab : 'jugar'} onSelect={switchTab} badges={{ album: unread }} />
        )}
        {/* La ronda celebra sus propios logros al final: los avisos globales quedan para el resto. */}
        {current.name !== 'ronda' && game.events.length > 0 && (
          <Toast event={game.events[0]} onClose={game.dismissEvent} />
        )}
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
    </div>
  )
}

export default function App() {
  return (
    <GameProvider>
      <Game />
    </GameProvider>
  )
}
