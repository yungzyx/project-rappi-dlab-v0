import { useEffect, useRef, useState } from 'react'
import BackButton from '../../components/BackButton'
import ProductRow from '../../components/ProductRow'
import Img from '../../components/Img'
import { useToast } from '../../components/Toast'
import { HeartIcon } from '../../components/Icons'
import { cartEventFields } from '../../api/orders'
import { productsOfStore, storeFor, storeVertical } from '../../data/catalog'
import { useEvents } from '../../state/EventsContext'
import { useFavorites } from '../../state/FavoritesContext'
import { WEIGHTS, useProfile } from '../../state/ProfileContext'
import { StoreMeta } from '../../components/StoreMeta'
import RealMenu from './RealMenu'
import './store.css'

const MODES = ['Delivery', 'Pickup']
// Pausa breve con esqueleto antes del menú real, como cuando la app lo trae de la red.
const MENU_LOADING_MS = 400
const SKELETON_ROWS = 5

/**
 * Página de tienda (funcionalidad agregada: no está en los videos).
 * Muestra la foto, los datos de la tarjeta, ♥ para favoritos y las ofertas de esa tienda que conoce el prototipo.
 * `params.item`: el producto que se tocó para llegar aquí (en el chat, «Para ti» o una vertical), si lo hubo.
 */
export default function StoreScreen({ back, params }) {
  // Lo que llega por parámetro manda (p. ej. la foto de un banner); el catálogo completa lo que falte o venga vacío.
  const given = Object.fromEntries(Object.entries(params.store).filter(([, value]) => value !== '' && value != null))
  const known = storeFor(params.store)
  const store = { ...known, ...given }
  const toast = useToast()
  const favorites = useFavorites()
  const [mode, setMode] = useState(MODES[0])
  const isFavorite = favorites.isFavorite(store.name)
  const products = productsOfStore(store.name)
  // Los restaurantes del scraper traen su menú real (se busca en el catálogo: el historial guarda una copia liviana).
  const menu = known?.sections
  const scrollRef = useRef(null)
  const [menuReady, setMenuReady] = useState(!menu)
  const { track } = useProfile()

  useEffect(() => {
    if (menuReady) return undefined
    const timer = setTimeout(() => setMenuReady(true), MENU_LOADING_MS)
    return () => clearTimeout(timer)
  }, [menuReady])

  const events = useEvents()
  // Vertical de la tienda en los eventos: el embudo del panel cuenta como entrada lo que pasa en cada vertical.
  const vertical = storeVertical(store)
  const item = params.item
  // Un producto que llegó por parámetro (p. ej. de la API) y no está en el catálogo local se muestra destacado arriba.
  const listed = (candidate) => candidate.id === item?.id || candidate.name === item?.name
  const chosen = item && !products.some(listed) && !menu?.some((section) => section.items.some(listed)) ? item : null
  // Una vez por tienda: StrictMode monta dos veces en desarrollo y contaría la visita doble.
  const tracked = useRef(null)
  useEffect(() => {
    if (tracked.current === store.name) return
    tracked.current = store.name
    track(store.name, WEIGHTS.store)
    events.track('view_store', {
      vertical,
      entity_type: 'store',
      entity_id: store.id ? String(store.id) : undefined,
      payload: { name: store.name } })
    // Llegar tocando un producto es verlo (el prototipo no tiene página de producto): mismos campos que el carro.
    if (item) events.track('view_item', { ...cartEventFields(item), vertical: item.vertical ?? vertical })
  }, [store.name, store.id, vertical, item, track, events])

  const toggleFavorite = () => {
    favorites.toggle(store)
    toast(isFavorite ? 'Quitada de favoritos' : 'Agregada a My Favorites')
  }

  return (
    <div ref={scrollRef} className="screen store">
      <div className={store.logo ? 'store-hero is-logo' : 'store-hero'}>
        <Img src={store.img} eager />
      </div>
      <BackButton className="store-round store-round--back" onClick={back} />
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

        {chosen && (
          <>
            <h2 className="section-title store-title">Lo que elegiste</h2>
            <ul className="store-products">
              <ProductRow product={chosen} />
            </ul>
          </>
        )}

        {menu ? (
          menuReady ? (
            <RealMenu sections={menu} scrollRef={scrollRef} />
          ) : (
            <MenuSkeleton />
          )
        ) : products.length > 0 || !chosen ? (
          <h2 className="section-title store-title">Deals</h2>
        ) : null}
        {menu ? null : products.length > 0 ? (
          <ul className="store-products">
            {products.map((product) => (
              <ProductRow key={product.id} product={product} />
            ))}
          </ul>
        ) : chosen ? null : (
          <p className="store-empty">El menú completo de esta tienda todavía no está en el prototipo.</p>
        )}
      </section>
    </div>
  )
}

function MenuSkeleton() {
  return (
    <div className="menu-skeleton" aria-label="Cargando menú" role="status">
      <div className="menu-skeleton-tabs">
        <span />
        <span />
        <span />
      </div>
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <div key={i} className="menu-skeleton-row">
          <span className="menu-skeleton-lines">
            <span />
            <span />
            <span />
          </span>
          <span className="menu-skeleton-photo" />
        </div>
      ))}
    </div>
  )
}
