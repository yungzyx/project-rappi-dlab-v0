import { useEffect, useId, useState } from 'react'
import { home } from '../../api/catalog'
import { offer } from '../../api/mochi'
import { noteAccepted, noteShown } from '../../api/suggestions'
import { userId } from '../../api/user'
import { useApi } from '../../api/useApi'
import { VERTICAL_NAMES } from '../../data/verticals'
import { useEvents } from '../../state/EventsContext'
import { useProfile } from '../../state/ProfileContext'
import Mascot from '../assistant/Mascot'
import OfflineNotice from '../OfflineNotice'
import ProductRow from '../ProductRow'
import StoreList from '../StoreList'

// Sugerencias sacadas de los textos que rota el buscador de la Home, en español: la búsqueda es del catálogo chileno.
const RECENT = ['Plátano', 'Agua', 'Chocolate', 'Hamburguesa', 'Cerveza', 'Pizza']
const POPULAR_COUNT = 6
// Productos que se ven de cada vertical; «Ver más» muestra el resto de lo que trajo la API.
const GROUP_PREVIEW = 3
const NO_RESULT_ORIGIN = 'mochi-sin_resultado'

export function RecentSearches({ onPick }) {
  return (
    <>
      <h2 className="search-heading">Recent searches</h2>
      <div className="search-chips">
        {RECENT.map((term) => (
          <button key={term} type="button" className="search-chip tap" onClick={() => onPick(term)}>
            {term}
          </button>
        ))}
      </div>
    </>
  )
}

/** Las tiendas populares son las cercanas de la Home de la API; si no llega, la sección no aparece. */
export function PopularStores({ onOpen }) {
  const { data } = useApi(home, [])
  if (!data?.nearbyStores.length) return null
  return (
    <>
      <h2 className="search-heading">Popular stores</h2>
      <StoreList stores={data.nearbyStores.slice(0, POPULAR_COUNT)} onOpen={onOpen} />
    </>
  )
}

/**
 * Resultados de una búsqueda escrita (`data` de `useSearch`): un grupo por vertical con su nombre, o el aviso de que no
 * hay, o «Sin conexión». Un producto se abre en su tienda (`onOpenProduct`). Mientras carga se ven los resultados
 * anteriores. Con `onOpenVertical` (solo el buscador con Mochi), sin resultados Mochi no deja un callejón sin salida:
 * ofrece la vertical que tiene lo buscado o invita a buscar con otras palabras (`onTryAnother`).
 */
export function SearchResults({ query, data, loading = false, error = null, onRetry, onOpenProduct, onOpenVertical, onTryAnother }) {
  if (error) return <OfflineNotice onRetry={onRetry} />
  if (!data) return loading ? <p className="search-loading" role="status">Buscando…</p> : null

  const text = query.trim()
  // Sin nada que mostrar, el aviso espera a que llegue la respuesta de lo escrito (no se mezcla con lo de antes).
  if (data.groups.length === 0)
    return loading ? null : onOpenVertical ? (
      <MochiEmpty key={text} query={text} onOpenVertical={onOpenVertical} onTryAnother={onTryAnother} />
    ) : (
      <p className="search-empty">No results for “{text}”.</p>
    )

  return (
    <>
      {data.groups.map((group) => (
        <ResultGroup key={`${data.query}|${group.vertical}`} group={group} onOpenProduct={onOpenProduct} />
      ))}
    </>
  )
}

function ResultGroup({ group, onOpenProduct }) {
  const titleId = useId()
  const [expanded, setExpanded] = useState(false)
  const hidden = group.products.length - GROUP_PREVIEW
  const shown = expanded ? group.products : group.products.slice(0, GROUP_PREVIEW)
  return (
    <section aria-labelledby={titleId}>
      <h2 id={titleId} className="search-heading">
        {VERTICAL_NAMES[group.vertical] ?? group.vertical}
      </h2>
      <ul className="search-products">
        {shown.map((product) => (
          <ProductRow
            key={product.id}
            product={product}
            showStore
            onOpenStore={onOpenProduct && product.storeId != null ? () => onOpenProduct(product) : undefined}
          />
        ))}
      </ul>
      {!expanded && hidden > 0 && (
        <button type="button" className="search-more tap" onClick={() => setExpanded(true)}>
          Ver más ({hidden})
        </button>
      )}
    </section>
  )
}

/**
 * La oferta `sin_resultado` de Mochi. Si no tiene nada (204) o falla, solo invita a buscar con otras palabras. Como las
 * demás ofertas, registra su mostrada; tocar «Ver en…» cuenta una aceptada (una, con el concepto de la oferta: no se
 * agregó ningún producto), que noteAccepted cuenta una sola vez.
 */
function MochiEmpty({ query, onOpenVertical, onTryAnother }) {
  const { data: found, loading } = useApi(() => offer('sin_resultado', { query }, { userId: userId() }).catch(() => null), [query])
  const events = useEvents()
  const generation = useProfile()?.resets ?? 0
  useEffect(() => {
    if (!found?.vertical) return
    const offered = { concept: found.reason?.concept, vertical: found.backendVertical }
    noteShown(events.track, found.products, { origin: NO_RESULT_ORIGIN, ...offered, generation })
  }, [found, events, generation])
  if (loading) return null
  const verticalName = found?.vertical ? VERTICAL_NAMES[found.vertical] : null
  const see = () => {
    const offered = { concept: found.reason?.concept, vertical: found.backendVertical }
    noteAccepted(events.track, [offered], { origin: NO_RESULT_ORIGIN, generation })
    onOpenVertical(found.vertical)
  }
  return (
    <div className="search-mochi" role="status">
      <Mascot size={56} mood="listen" />
      <div>
        <p>{verticalName ? found.text : `No encontré «${query}». ¿Lo buscamos con otras palabras?`}</p>
        <button
          type="button"
          className="search-mochi-action tap"
          onClick={verticalName ? see : () => onTryAnother()}
        >
          {verticalName ? `Ver en ${verticalName}` : 'Probar otra búsqueda'}
        </button>
      </div>
    </div>
  )
}
