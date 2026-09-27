import { useEffect, useRef, useState } from 'react'
import ProductRow from '../../components/ProductRow'
import { useToast } from '../../components/Toast'
import { ChevronLeft, HeartIcon } from '../../components/Icons'
import { findStore, productsOfStore } from '../../data/catalog'
import { useFavorites } from '../../state/FavoritesContext'
import { WEIGHTS, useProfile } from '../../state/ProfileContext'
import { StoreMeta } from '../home/StoreCards'
import RealMenu from './RealMenu'
import './store.css'

const MODES = ['Delivery', 'Pickup']

/**
 * Página de tienda (funcionalidad agregada: no está en los videos).
 * Muestra la foto, los datos de la tarjeta, ♥ para favoritos y las ofertas de esa tienda que conoce el prototipo.
 */
export default function StoreScreen({ back, params }) {
  // Lo que llega por parámetro manda (p. ej. la foto de un banner); el catálogo completa lo que falte o venga vacío.
  const given = Object.fromEntries(Object.entries(params.store).filter(([, value]) => value !== '' && value != null))
  const store = { ...findStore(params.store.name), ...given }
  const toast = useToast()
  const favorites = useFavorites()
  const [mode, setMode] = useState(MODES[0])
  const isFavorite = favorites.isFavorite(store.name)
  const products = productsOfStore(store.name)
  // Los restaurantes del scraper traen su menú real (se busca en el catálogo: el historial guarda una copia liviana).
  const menu = findStore(store.name)?.sections
  const scrollRef = useRef(null)
  const { track } = useProfile()

  useEffect(() => {
    track(store.name, WEIGHTS.store)
  }, [store.name, track])

  const toggleFavorite = () => {
    favorites.toggle(store)
    toast(isFavorite ? 'Quitada de favoritos' : 'Agregada a My Favorites')
  }

  return (
    <div ref={scrollRef} className="screen store">
      <div className={store.logo ? 'store-hero is-logo' : 'store-hero'}>
        <img src={store.img} alt="" />
      </div>
      <button type="button" className="store-round store-round--back tap" aria-label="Volver" onClick={back}>
        <ChevronLeft size={20} />
      </button>
      <button
        type="button"
        className={isFavorite ? 'store-round store-round--fav is-on tap' : 'store-round store-round--fav tap'}
        aria-label={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
        aria-pressed={isFavorite}
        onClick={toggleFavorite}
      >
        <HeartIcon size={20} />
      </button>

      <section className="store-sheet">
        <h1>{store.name}</h1>
        {store.rating && <p className="store-rating">★ {store.rating}</p>}
        {store.eta && <StoreMeta store={store} className="store-meta" />}

        <div className="store-modes" role="tablist">
          {MODES.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={option === mode}
              className={option === mode ? 'store-mode is-active' : 'store-mode'}
              onClick={() => setMode(option)}
            >
              {option}
            </button>
          ))}
        </div>

        {menu ? (
          <RealMenu sections={menu} scrollRef={scrollRef} />
        ) : (
          <h2 className="section-title store-title">Deals</h2>
        )}
        {menu ? null : products.length > 0 ? (
          <ul className="store-products">
            {products.map((product) => (
              <ProductRow key={product.id} product={product} />
            ))}
          </ul>
        ) : (
          <p className="store-empty">El menú completo de esta tienda todavía no está en el prototipo.</p>
        )}
      </section>
    </div>
  )
}
