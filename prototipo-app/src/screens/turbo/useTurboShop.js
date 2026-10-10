import { useState } from 'react'
import { store as loadShop, verticalStores } from '../../api/catalog'
import { useApi } from '../../api/useApi'
import { useToast } from '../../components/Toast'

/**
 * La tienda Turbo de la que sale la pantalla: la primera de `verticalStores('turbo')` (la de más productos vigentes), con sus
 * pasillos y de a una página de productos de uno. Sus pasillos son las pestañas.
 * Devuelve `{ info, aisles, aisle, aisleName, setAisle, products, hasMore, loadMore, loadingMore, status, retry }`:
 * - `info`: la tarjeta de la tienda (`eta`, nombre…), apenas llega la lista;
 * - `aisle`: el id del pasillo que se ve (el primero mientras no se elija otro); `products`, los que lleva cargados;
 * - `status`: 'loading', 'ready', 'empty' (no hay tienda Turbo en el catálogo) o 'offline' (la API no contesta).
 */
export function useTurboShop() {
  const toast = useToast()
  const stores = useApi(() => verticalStores('turbo'), [])
  const shopId = stores.data?.stores[0]?.id ?? null
  const [chosen, setChosen] = useState(null) // el pasillo que se eligió; sin elegir, la API trae el primero
  // Los pasillos se siguen viendo mientras llegan los productos del que se acaba de elegir.
  const [aisles, setAisles] = useState([])
  // Las páginas que se sumaron con «Ver más», de un pasillo: valen solo mientras sea el que se ve.
  const [more, setMore] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const shop = useApi(() => (shopId === null ? null : loadShop(shopId, { aisle: chosen })), [shopId, chosen])
  if (shop.data?.aisles && shop.data.aisles !== aisles) setAisles(shop.data.aisles)

  const data = shop.data
  const aisleKey = data ? `${data.store.id}:${data.aisle?.id}` : null
  const added = more?.key === aisleKey ? more : null
  const products = data ? [...data.products, ...(added?.products ?? [])] : []
  const hasMore = added ? added.hasMore : Boolean(data?.hasMore)

  const loadMore = async () => {
    const page = (added?.page ?? data.page) + 1
    setLoadingMore(true)
    try {
      const next = await loadShop(data.store.id, { aisle: data.aisle.id, page })
      const seen = new Set(products.map((product) => product.id))
      setMore({
        key: aisleKey,
        products: [...(added?.products ?? []), ...next.products.filter((product) => !seen.has(product.id))],
        page: next.page,
        hasMore: next.hasMore,
      })
    } catch {
      toast('No se pudo cargar más productos')
    } finally {
      setLoadingMore(false)
    }
  }

  // Un 404 (la tienda ya no está) es «no hay», no «sin conexión»; cualquier otro fallo, sí.
  const unavailable = (error) => (error.status === 404 ? 'empty' : 'offline')
  let status = 'loading'
  if (stores.error) status = unavailable(stores.error)
  else if (stores.data && shopId === null) status = 'empty'
  else if (shop.error) status = unavailable(shop.error)
  else if (data) status = 'ready'

  return {
    info: stores.data?.stores[0] ?? null,
    aisles,
    aisle: chosen ?? data?.aisle?.id ?? null,
    setAisle: setChosen,
    aisleName: data?.aisle?.name ?? null,
    products,
    hasMore,
    loadMore,
    loadingMore,
    status,
    retry: () => (stores.error ? stores.retry() : shop.retry()),
  }
}
