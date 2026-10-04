import { useEffect, useMemo, useRef, useState } from 'react'
import ProductRow from '../../components/ProductRow'
import StoreList from '../../components/StoreList'
import { ChevronLeft, SearchIcon } from '../../components/Icons'
import { ALL_STORES, search } from '../../data/catalog'
import { useEvents } from '../../state/EventsContext'
import { WEIGHTS, useProfile } from '../../state/ProfileContext'
import './search.css'

// Sugerencias sacadas de los textos que rota el buscador de la Home.
const RECENT = ['Banana', 'Water', 'Chocolate', 'Burger', 'Beer', 'Pizza']
const POPULAR_COUNT = 6
const SEARCH_SETTLE_MS = 900

/** Buscador (funcionalidad agregada): filtra en vivo tiendas y productos del prototipo. */
export default function SearchScreen({ back, push, params }) {
  const [query, setQuery] = useState(params.query ?? '')
  const results = useMemo(() => search(query), [query])
  const hasQuery = query.trim().length > 0
  const isEmpty = hasQuery && results.stores.length === 0 && results.products.length === 0
  const { track } = useProfile()
  const events = useEvents()
  const logged = useRef(null)

  // Cuenta la búsqueda cuando el usuario deja de escribir, no con cada letra.
  useEffect(() => {
    if (query.trim().length < 3) return undefined
    const timer = setTimeout(() => track(query, WEIGHTS.query), SEARCH_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [query, track])

  // Para el panel, solo búsquedas terminadas (Enter, salir del campo o una sugerencia), no palabras a medio
  // escribir. Sin "unmet": este catálogo es solo lo de las capturas, no dice si Rappi lo tiene. Lleva la vertical
  // de la pantalla desde la que se abrió el buscador (si la hay): el embudo del panel se mide por vertical.
  const logSearch = (term) => {
    const clean = term.trim()
    if (!clean || clean === logged.current) return
    logged.current = clean
    const found = search(clean)
    const results = found.stores.length + found.products.length
    events.track('search', { query: clean, modality: 'texto', results, vertical: params.vertical })
  }

  return (
    <div className="screen search">
      <header className="search-header">
        <button type="button" className="search-back tap" aria-label="Volver" onClick={back}>
          <ChevronLeft size={20} />
        </button>
        <label className="search-field">
          <SearchIcon size={19} />
          <input
            autoFocus
            type="search"
            placeholder="What do you want today?"
            value={query}
            maxLength={500}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && logSearch(query)}
            onBlur={() => logSearch(query)}
          />
          {hasQuery && (
            <button type="button" className="search-clear" aria-label="Borrar" onClick={() => setQuery('')}>
              ×
            </button>
          )}
        </label>
      </header>

      {!hasQuery && (
        <>
          <h2 className="search-heading">Recent searches</h2>
          <div className="search-chips">
            {RECENT.map((term) => (
              <button
                key={term}
                type="button"
                className="search-chip tap"
                onClick={() => {
                  setQuery(term)
                  logSearch(term)
                }}
              >
                {term}
              </button>
            ))}
          </div>
          <h2 className="search-heading">Popular stores</h2>
          <StoreList stores={ALL_STORES.slice(0, POPULAR_COUNT)} onOpen={(store) => push('store', { store })} />
        </>
      )}

      {isEmpty && <p className="search-empty">No results for “{query.trim()}”.</p>}

      {results.stores.length > 0 && (
        <>
          <h2 className="search-heading">Stores</h2>
          <StoreList stores={results.stores} onOpen={(store) => push('store', { store })} />
        </>
      )}

      {results.products.length > 0 && (
        <>
          <h2 className="search-heading">Products</h2>
          <ul className="search-products">
            {results.products.map((product) => (
              <ProductRow key={product.id} product={product} showStore />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
