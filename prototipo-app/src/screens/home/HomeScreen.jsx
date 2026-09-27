import BottomNav from '../../components/BottomNav'
import { AccountIcon, FavoritesIcon, HomeIcon, OffersIcon } from '../../components/Icons'
import AccountScreen from '../account/AccountScreen'
import DealsScreen from '../deals/DealsScreen'
import FavoritesScreen from '../favorites/FavoritesScreen'
import HomeFeed from './HomeFeed'

const NAV_ITEMS = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'offers', label: 'Offers', Icon: OffersIcon },
  { id: 'favorites', label: 'Favorites', Icon: FavoritesIcon },
  { id: 'account', label: 'Account', Icon: AccountIcon },
]

/** Contenedor de las 4 pestañas de la barra inferior. La pestaña activa la guarda App. */
export default function HomeScreen({ push, tab, setTab }) {
  return (
    <>
      {tab === 'home' && <HomeFeed push={push} />}
      {tab === 'offers' && <DealsScreen push={push} />}
      {tab === 'favorites' && <FavoritesScreen push={push} />}
      {tab === 'account' && <AccountScreen onBack={() => setTab('home')} push={push} />}
      <BottomNav items={NAV_ITEMS} active={tab} onSelect={setTab} onSearch={() => push('search')} />
    </>
  )
}
