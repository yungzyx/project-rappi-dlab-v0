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

/** Resultados de una búsqueda escrita: tiendas y productos, o el aviso de que no hay. */
export function SearchResults({ query, results, isEmpty, onOpenStore }) {
  return (
    <>
      {isEmpty && <p className="search-empty">No results for “{query.trim()}”.</p>}

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
