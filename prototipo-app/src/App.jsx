import { useEffect } from 'react'
import AddressSheet from './components/AddressSheet'
import AssistantPanel from './components/assistant/AssistantPanel'
import CartBar from './components/CartBar'
import DemoToggle from './components/DemoToggle'
import Nudge from './components/assistant/Nudge'
import StatusBar from './components/StatusBar'
import { ToastProvider } from './components/Toast'
import CheckoutScreen from './screens/checkout/CheckoutScreen'
import FavorScreen from './screens/favor/FavorScreen'
import HomeScreen from './screens/home/HomeScreen'
import ListScreen from './screens/list/ListScreen'
import LoyaltyScreen from './screens/loyalty/LoyaltyScreen'
import RestaurantsScreen from './screens/restaurants/RestaurantsScreen'
import SearchScreen from './screens/search/SearchScreen'
import StoreScreen from './screens/store/StoreScreen'
import TrackingScreen from './screens/tracking/TrackingScreen'
import TravelScreen from './screens/travel/TravelScreen'
import TurboScreen from './screens/turbo/TurboScreen'
import VerticalScreen from './screens/vertical/VerticalScreen'
import { useNavigation } from './hooks/useNavigation'
import { AddressProvider } from './state/AddressContext'
import { AssistantProvider } from './state/AssistantContext'
import { CartProvider } from './state/CartContext'
import { DemoProvider } from './state/DemoContext'
import { EventsProvider } from './state/EventsContext'
import { FavoritesProvider } from './state/FavoritesContext'
import { LoyaltyProvider } from './state/LoyaltyContext'
import { NudgeProvider } from './state/NudgeContext'
import { OrdersProvider } from './state/OrdersContext'
import { ProfileProvider } from './state/ProfileContext'

const SCREENS = {
  home: HomeScreen,
  restaurants: RestaurantsScreen,
  turbo: TurboScreen,
  store: StoreScreen,
  search: SearchScreen,
  vertical: VerticalScreen,
  travel: TravelScreen,
  favor: FavorScreen,
  loyalty: LoyaltyScreen,
  list: ListScreen,
  checkout: CheckoutScreen,
  tracking: TrackingScreen,
}

// En el checkout y el seguimiento no se muestran la barra del carrito ni el aviso de Bigotes.
const SCREENS_WITHOUT_CART = new Set(['checkout', 'tracking'])

// Pantallas con barra inferior: ahí la barra del carrito flota más arriba.
const SCREENS_WITH_NAV = new Set(['home', 'turbo'])

// Vertical de la pantalla actual (ids del prototipo): Bigotes busca ahí primero. Turbo va con su código del
// backend: el 'express' del prototipo es conveniencia para la API.
export const screenVertical = (screen) =>
  screen.name === 'vertical' ? screen.params?.id : { restaurants: 'restaurants', turbo: 'turbo' }[screen.name]

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
  // La pestaña de la Home vive en la navegación para no perderla al abrir una tienda y volver.
  const { stack, homeTab, direction, push, back, setHomeTab } = useNavigation()
  usePhoneScale()

  const current = stack[stack.length - 1]
  // Un enlace viejo o un nombre desconocido no rompe la app: vuelve a la Home.
  const Screen = SCREENS[current.name] ?? HomeScreen

  return (
    <DemoProvider>
      <EventsProvider>
        <main className="stage">
          <DemoToggle />
          <div className="phone">
            <ProfileProvider>
              <AssistantProvider>
                <CartProvider>
                  <OrdersProvider>
                    <FavoritesProvider>
                      <AddressProvider>
                        <LoyaltyProvider>
                          <ToastProvider>
                            <NudgeProvider>
                              <div key={`${stack.length}-${current.name}`} className={`screen-wrap enter-${direction}`}>
                                <Screen
                                  push={push}
                                  back={back}
                                  params={current.params}
                                  tab={homeTab}
                                  setTab={setHomeTab}
                                />
                              </div>
                              {!SCREENS_WITHOUT_CART.has(current.name) && (
                                <>
                                  <CartBar raised={SCREENS_WITH_NAV.has(current.name)} push={push} />
                                  <Nudge raised={SCREENS_WITH_NAV.has(current.name)} />
                                </>
                              )}
                              <AssistantPanel push={push} vertical={screenVertical(current)} />
                              <AddressSheet />
                              <StatusBar />
                            </NudgeProvider>
                          </ToastProvider>
                        </LoyaltyProvider>
                      </AddressProvider>
                    </FavoritesProvider>
                  </OrdersProvider>
                </CartProvider>
              </AssistantProvider>
            </ProfileProvider>
          </div>
        </main>
      </EventsProvider>
    </DemoProvider>
  )
}
