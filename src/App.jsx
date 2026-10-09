import { useState } from 'react'
import BottomNav from './components/BottomNav.jsx'
import Home from './screens/Home.jsx'
import Settings from './screens/Settings.jsx'
import Vertical from './screens/Vertical.jsx'
import { GameProvider } from './state/GameContext.jsx'
import './styles/tokens.css'
import './styles/global.css'

const TABS = ['inicio', 'mapa', 'pasaporte', 'album']

/** Navegación con una pila de pantallas: la pestaña es la base y lo demás se apila encima. */
function Game() {
  const [stack, setStack] = useState([{ name: 'inicio', params: {} }])
  const current = stack.at(-1)
  const tab = stack[0].name

  const go = (name, params = {}) => setStack((s) => [...s, { name, params }])
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))
  const switchTab = (name) => setStack([{ name, params: {} }])
  const nav = { go, back, home: () => switchTab('inicio'), switchTab }

  let screen
  switch (current.name) {
    case 'ajustes':
      screen = <Settings {...nav} />
      break
    case 'vertical':
      screen = <Vertical {...nav} {...current.params} />
      break
    default:
      screen = <Home {...nav} />
  }

  return (
    <div className="stage">
      <div className="phone">
        <div className="status-bar" aria-hidden="true">
          <span>9:41</span>
        </div>
        <main key={stack.length + current.name}>{screen}</main>
        <BottomNav active={TABS.includes(tab) ? tab : 'inicio'} onSelect={switchTab} />
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
