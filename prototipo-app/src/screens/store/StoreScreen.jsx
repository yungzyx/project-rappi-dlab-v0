import { useEffect, useRef, useState } from 'react'
import { menu as loadMenu, store as loadShop } from '../../api/catalog'
import { cartEventFields } from '../../api/orders'
import { useApi } from '../../api/useApi'
import BackButton from '../../components/BackButton'
import ProductRow from '../../components/ProductRow'
import Img from '../../components/Img'
import OfflineNotice from '../../components/OfflineNotice'
import { useToast } from '../../components/Toast'
import { HeartIcon } from '../../components/Icons'
import { useEvents } from '../../state/EventsContext'
import { useFavorites } from '../../state/FavoritesContext'
import { WEIGHTS, useProfile } from '../../state/ProfileContext'
import { StoreMeta } from '../../components/StoreMeta'
import RealMenu from './RealMenu'
import './store.css'

const MODES = ['Delivery', 'Pickup']
const SKELETON_ROWS = 5

/** Las tiendas del catálogo se abren por su id numérico; las que Mochi abre solo por nombre no están en la base. */
const catalogId = (id) => (/^\d+$/.test(String(id ?? '')) ? Number(id) : null)

/** El menú de un restaurante, con su tarjeta como `store`. */
async function readMenu(id) {
  const { restaurant, sections } = await loadMenu(id)
  return { store: restaurant, sections }
}

/**
 * Página de tienda (funcionalidad agregada: no está en los videos). Todo sale de la API (`/catalog`):
 * un restaurante (`params.store.vertical === 'restaurants'`) con su menú, y una tienda con sus pasillos, de a una página.
 * Muestra la foto, los datos de la tarjeta y ♥ para favoritos.
 * `params.item`: el producto que se tocó para llegar aquí (en el chat, «Para ti» o una vertical), si lo hubo.
 */
export default function StoreScreen({ back, params }) {
  const given = params.store
  const id = catalogId(given.id)
  const restaurant = given.vertical === 'restaurants'
  const item = params.item
  const toast = useToast()
  const favorites = useFavorites()
  const events = useEvents()
  const { track } = useProfile()
  const [mode, setMode] = useState(MODES[0])
  const [aisle, setAisle] = useState(null) // el pasillo que se eligió; sin elegir, la API trae el primero
  // Los pasillos de la tienda se siguen viendo mientras llegan los productos del que se acaba de elegir.
  const [aisles, setAisles] = useState([])
  // Las páginas que se sumaron con «Ver más», de un pasillo: valen solo mientras sea el que se ve.
  const [more, setMore] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const scrollRef = useRef(null)
  const { data, error, retry } = useApi(
    () => (id === null ? null : restaurant ? readMenu(id) : loadShop(id, { aisle })),
    [id, restaurant, aisle],
  )
  if (data?.aisles && data.aisles !== aisles) setAisles(data.aisles)

  const notInCatalog = id === null || error?.status === 404
  // Lo que manda la API (foto, tiempo, nota) reemplaza al enlace; mientras llega se ve lo que traía el enlace.
  const store = data?.store ?? given
  const isFavorite = favorites.isFavorite(store)

  // Una vez por tienda: StrictMode monta dos veces en desarrollo, y cambiar de pasillo vuelve a traer la misma tienda.
  const tracked = useRef(null)
  const loaded = data?.store
  useEffect(() => {
    if (!loaded || tracked.current === loaded.id) return
    tracked.current = loaded.id
    track(loaded.name, WEIGHTS.store)
    events.track('view_store', {
      vertical: loaded.vertical,
      entity_type: 'store',
      entity_id: String(loaded.id),
      payload: { name: loaded.name } })
    // Llegar tocando un producto es verlo (el prototipo no tiene página de producto): mismos campos que el carro.
    if (item) events.track('view_item', { ...cartEventFields(item), vertical: item.vertical ?? loaded.vertical })
  }, [loaded, item, track, events])

  const toggleFavorite = () => {
    favorites.toggle(store)
    toast(isFavorite ? 'Quitada de favoritos' : 'Agregada a favoritos')
  }

  // Los productos que se ven de un pasillo: su primera página y las que se sumaron.
  const aisleKey = data?.products ? `${data.store.id}:${data.aisle?.id}` : null
  const added = more?.key === aisleKey ? more : null
  const products = data?.products ? [...data.products, ...(added?.products ?? [])] : []
  const hasMore = added ? added.hasMore : Boolean(data?.hasMore)

  const loadMoreProducts = async () => {
    const page = (added?.page ?? data.page) + 1
    setLoadingMore(true)
    try {
      const next = await loadShop(data.store.id, { aisle: data.aisle.id, page })
      const seen = new Set(products.map((product) => product.id))
      setMore({
        key: aisleKey,
        products: [...(added?.products ?? []), ...next.products.filter((product) => !seen.has(product.id))],
        page: next.page,
        hasMore: next.hasMore })
    } catch {
      toast('No se pudo cargar más productos')
    } finally {
      setLoadingMore(false)
    }
  }

  // Un producto que llegó por parámetro y no está en lo que se ve se muestra destacado arriba.
  const listed = (candidate) => candidate.id === item?.id || candidate.name === item?.name
  const visible = data?.sections ? data.sections.flatMap((section) => section.items) : products
  const chosen = item && data && !visible.some(listed) ? item : null

  return (
    <div ref={scrollRef} className="screen store">
      <div className={store.logo ? 'store-hero is-logo' : 'store-hero'}>
        <Img src={store.img} eager />
      </div>
      <BackButton className="store-round store-round--back" onClick={back} />
      {!notInCatalog && (
        <button
          type="button"
          className={isFavorite ? 'store-round store-round--fav is-on tap' : 'store-round store-round--fav tap'}
          aria-label={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          aria-pressed={isFavorite}
          onClick={toggleFavorite}
        >
          <HeartIcon size={20} />
        </button>
      )}

      <section className="store-sheet">
        {store.name && <h1>{store.name}</h1>}
        {notInCatalog ? (
          <p className="store-empty">Esta tienda no está en el catálogo</p>
        ) : (
          <>
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

            {aisles.length > 0 && <AisleTabs aisles={aisles} active={aisle ?? data?.aisle?.id} onChoose={setAisle} />}
            {error && <OfflineNotice onRetry={retry} />}
            {!data && !error && <MenuSkeleton tabs={aisles.length === 0} />}
            {data?.sections && <RealMenu sections={data.sections} scrollRef={scrollRef} />}
            {data?.products &&
              (products.length > 0 ? (
                <>
                  <ul className="store-products">
                    {products.map((product) => (
                      <ProductRow key={product.id} product={product} />
                    ))}
                  </ul>
                  {hasMore && (
                    <button type="button" className="store-more tap" disabled={loadingMore} onClick={loadMoreProducts}>
                      Ver más
                    </button>
                  )}
                </>
              ) : (
                <p className="store-empty">No hay productos para mostrar.</p>
              ))}
          </>
        )}
      </section>
    </div>
  )
}

/** Los pasillos de una tienda: al tocar uno se piden sus productos (no hay scroll entre pasillos, como en el menú de un restaurante). */
function AisleTabs({ aisles, active, onChoose }) {
  return (
    <nav className="menu-tabs" aria-label="Pasillos">
      {aisles.map((aisle) => (
        <button
          key={aisle.id}
          type="button"
          className={aisle.id === active ? 'menu-tab is-active' : 'menu-tab'}
          aria-current={aisle.id === active ? 'true' : undefined}
          onClick={() => onChoose(aisle.id)}
        >
          {aisle.name}
        </button>
      ))}
    </nav>
  )
}

function MenuSkeleton({ tabs }) {
  return (
    <div className="menu-skeleton" aria-label="Cargando" role="status">
      {tabs && (
        <div className="menu-skeleton-tabs">
          <span />
          <span />
          <span />
        </div>
      )}
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
