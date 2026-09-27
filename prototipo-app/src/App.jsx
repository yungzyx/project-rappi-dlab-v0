import { useEffect, useState } from 'react'
import AddressSheet from './components/AddressSheet'
import AssistantPanel from './components/assistant/AssistantPanel'
import CartBar from './components/CartBar'
import StatusBar from './components/StatusBar'
import { ToastProvider } from './components/Toast'
import HomeScreen from './screens/home/HomeScreen'
import ListScreen from './screens/list/ListScreen'
import LoyaltyScreen from './screens/loyalty/LoyaltyScreen'
import RestaurantsScreen from './screens/restaurants/RestaurantsScreen'
import SearchScreen from './screens/search/SearchScreen'
import StoreScreen from './screens/store/StoreScreen'
import TravelScreen from './screens/travel/TravelScreen'
import TurboScreen from './screens/turbo/TurboScreen'
import VerticalScreen from './screens/vertical/VerticalScreen'
import { AddressProvider } from './state/AddressContext'
import { AssistantProvider } from './state/AssistantContext'
import { CartProvider } from './state/CartContext'
import { FavoritesProvider } from './state/FavoritesContext'
import { LoyaltyProvider } from './state/LoyaltyContext'
import { ProfileProvider } from './state/ProfileContext'

const SCREENS = {
  home: HomeScreen,
  restaurants: RestaurantsScreen,
  turbo: TurboScreen,
  store: StoreScreen,
  search: SearchScreen,
  vertical: VerticalScreen,
  travel: TravelScreen,
  loyalty: LoyaltyScreen,
  list: ListScreen,
}

// Pantallas con barra inferior: ahí la barra del carrito flota más arriba.
const SCREENS_WITH_NAV = new Set(['home', 'turbo'])

const PHONE_HEIGHT_PX = 874
const STAGE_MARGIN_PX = 48

// Achica el teléfono si la ventana del notebook es más baja que el iPhone.
function usePhoneScale() {
  useEffect(() => {
    const update = () => {
      const scale = Math.min(1, (window.innerHeight - STAGE_MARGIN_PX) / PHONE_HEIGHT_PX)
      document.documentElement.style.setProperty('--phone-scale', String(scale))
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
}

export default function App() {
  const [stack, setStack] = useState([{ name: 'home', params: {} }])
  const [direction, setDirection] = useState('none')
  // La pestaña de la Home vive aquí para no perderla al abrir una tienda y volver.
  const [homeTab, setHomeTab] = useState('home')
  usePhoneScale()

  const push = (name, params = {}) => {
    setDirection('push')
    setStack((prev) => [...prev, { name, params }])
  }
  const back = () => {
    setDirection('pop')
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))
  }

  const current = stack[stack.length - 1]
  const Screen = SCREENS[current.name]

  return (
    <main className="stage">
      <div className="phone">
        <ProfileProvider>
          <AssistantProvider>
            <CartProvider>
              <FavoritesProvider>
                <AddressProvider>
                  <LoyaltyProvider>
                    <ToastProvider>
                      <div key={`${stack.length}-${current.name}`} className={`screen-wrap enter-${direction}`}>
                        <Screen push={push} back={back} params={current.params} tab={homeTab} setTab={setHomeTab} />
                      </div>
                      <CartBar raised={SCREENS_WITH_NAV.has(current.name)} />
                      <AssistantPanel push={push} />
                      <AddressSheet />
                      <StatusBar />
                    </ToastProvider>
                  </LoyaltyProvider>
                </AddressProvider>
              </FavoritesProvider>
            </CartProvider>
          </AssistantProvider>
        </ProfileProvider>
      </div>
    </main>
  )
}
