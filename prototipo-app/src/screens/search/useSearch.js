import { useEffect, useMemo, useRef, useState } from 'react'
import { search } from '../../data/catalog'
import { useEvents } from '../../state/EventsContext'
import { WEIGHTS, useProfile } from '../../state/ProfileContext'

const SEARCH_SETTLE_MS = 900

/**
 * Búsqueda en vivo en las tiendas y productos del prototipo. La comparten el buscador de «Rappi hoy» y el de
 * Bigotes (Propuesta). `vertical`: la de la pantalla desde la que se abrió (el embudo del panel se mide por vertical).
 */
export function useSearch({ initial = '', vertical } = {}) {
  const [query, setQuery] = useState(initial)
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
  // escribir. Sin "unmet": este catálogo es solo lo de las capturas, no dice si Rappi lo tiene.
  const logSearch = (term) => {
    const clean = term.trim()
    if (!clean || clean === logged.current) return
    logged.current = clean
    const found = search(clean)
    events.track('search', {
      query: clean,
      modality: 'texto',
      results: found.stores.length + found.products.length,
      vertical,
    })
  }

  /** Una búsqueda reciente: se escribe en el campo y se registra al tiro. */
  const pick = (term) => {
    setQuery(term)
    logSearch(term)
  }

  return { query, setQuery, results, hasQuery, isEmpty, logSearch, pick }
}
