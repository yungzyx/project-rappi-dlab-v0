import HScroll from '../../components/HScroll'
import Img from '../../components/Img'
import TabPage from '../../components/TabPage'
import { findStore } from '../../data/catalog'
import { useFavorites } from '../../state/FavoritesContext'
import { RestaurantCard } from '../home/StoreCards'
import { BEST_GROCERY, BEST_RESTAURANTS, FAVORITE_STORES } from './data'
import './favorites.css'

/** Pestaña Favorites. Las tiendas marcadas con ♥ en la página de tienda aparecen primero. */
export default function FavoritesScreen({ push }) {
  const favorites = useFavorites()
  const openStore = (store) => push('store', { store })
  const openFavorite = (fav) => openStore(findStore(fav.name) ?? { name: fav.name, img: fav.logo, logo: true })
  const addedByUser = favorites.stores.filter((store) => !FAVORITE_STORES.some((fav) => fav.name === store.name))

  return (
    <TabPage title="My Favorites" color="#ee7d3e" className="favorites">
      <h2 className="favorites-heading favorites-heading--first">Favorite stores</h2>
      <HScroll className="favorites-logos">
        {addedByUser.map((store) => (
          <button key={store.name} type="button" className="favorite-logo is-new tap" onClick={() => openStore(store)}>
            <Img src={store.img} alt={store.name} />
          </button>
        ))}
        {FAVORITE_STORES.map((fav) => (
          <button key={fav.id} type="button" className="favorite-logo tap" onClick={() => openFavorite(fav)}>
            <img src={fav.logo} alt={fav.name} loading="lazy" />
          </button>
        ))}
      </HScroll>

      <h2 className="favorites-heading">Best grocery deals</h2>
      <HScroll className="card-row favorites-row">
        {BEST_GROCERY.map((store) => (
          <RestaurantCard key={store.id} store={store} onClick={() => openStore(store)} />
        ))}
      </HScroll>

      <h2 className="favorites-heading favorites-heading--restaurants">Best restaurants near you</h2>
      <HScroll className="card-row favorites-row favorites-row--restaurants">
        {BEST_RESTAURANTS.map((store) => (
          <RestaurantCard key={store.id} store={store} onClick={() => openStore(store)} />
        ))}
      </HScroll>
    </TabPage>
  )
}
