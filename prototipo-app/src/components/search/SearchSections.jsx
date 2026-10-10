import { emptySearch } from '../../assistant/emptySearch'
import Mascot from '../assistant/Mascot'
import ProductRow from '../ProductRow'
import StoreList from '../StoreList'
import { ALL_STORES } from '../../data/catalog'

// Sugerencias sacadas de los textos que rota el buscador de la Home.
const RECENT = ['Banana', 'Water', 'Chocolate', 'Burger', 'Beer', 'Pizza']
const POPULAR_COUNT = 6

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

export function PopularStores({ onOpen }) {
  return (
    <>
      <h2 className="search-heading">Popular stores</h2>
      <StoreList stores={ALL_STORES.slice(0, POPULAR_COUNT)} onOpen={onOpen} />
    </>
  )
}

/**
 * Resultados de una búsqueda escrita: tiendas y productos, o el aviso de que no hay. Con `onOpenVertical` y
 * `onRetry` (solo el buscador con Mochi), Mochi no deja un callejón sin salida: lleva a la vertical que tiene el tema
 * buscado o invita a buscar con otras palabras.
 */
export function SearchResults({ query, results, isEmpty, onOpenStore, onOpenVertical, onRetry }) {
  return (
    <>
      {isEmpty &&
        (onOpenVertical ? (
          <MochiEmpty query={query.trim()} onOpenVertical={onOpenVertical} onRetry={onRetry} />
        ) : (
          <p className="search-empty">No results for “{query.trim()}”.</p>
        ))}

      {results.stores.length > 0 && (
        <>
          <h2 className="search-heading">Stores</h2>
          <StoreList stores={results.stores} onOpen={onOpenStore} />
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
    </>
  )
}

function MochiEmpty({ query, onOpenVertical, onRetry }) {
  const hint = emptySearch(query)
  return (
    <div className="search-mochi" role="status">
      <Mascot size={56} mood="listen" />
      <div>
        <p>
          {hint
            ? `Aquí no hay «${query}», pero en ${hint.verticalName} sí.`
            : `No encontré «${query}». ¿Lo buscamos con otras palabras?`}
        </p>
        <button
          type="button"
          className="search-mochi-action tap"
          onClick={() => (hint ? onOpenVertical(hint.vertical) : onRetry())}
        >
          {hint ? `Ver en ${hint.verticalName}` : 'Probar otra búsqueda'}
        </button>
      </div>
    </div>
  )
}
