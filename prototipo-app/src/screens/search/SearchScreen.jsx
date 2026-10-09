import { SearchIcon } from '../../components/Icons'
import BackButton from '../../components/BackButton'
import { PopularStores, RecentSearches, SearchResults } from '../../components/search/SearchSections'
import { useSearch } from '../../components/search/useSearch'
import '../../components/search/search.css'

/** Buscador (funcionalidad agregada): filtra en vivo tiendas y productos del prototipo. */
export default function SearchScreen({ back, push, params }) {
  const { query, setQuery, results, hasQuery, isEmpty, logSearch, pick } = useSearch({
    initial: params.query ?? '',
    vertical: params.vertical })
  const openStore = (store) => push('store', { store })

  return (
    <div className="screen search">
      <header className="search-header">
        <BackButton className="search-back" onClick={back} />
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
          <RecentSearches onPick={pick} />
          <PopularStores onOpen={openStore} />
        </>
      )}

      <SearchResults query={query} results={results} isEmpty={isEmpty} onOpenStore={openStore} />
    </div>
  )
}
