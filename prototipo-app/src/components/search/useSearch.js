import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchApi } from '../../api/useSearchApi'
import { useEvents } from '../../state/EventsContext'

/**
 * Búsqueda en vivo en el catálogo de la API (todas las verticales, agrupada). La comparten el buscador de «Rappi hoy»
 * y el de Mochi (prototipo final). `vertical`: la de la pantalla desde la que se abrió (la API la suma a las que busca
 * y el embudo del panel se mide por vertical).
 * Devuelve `{ query, setQuery, data, loading, error, retry, hasQuery, logSearch, pick }`; `data`, `loading` y `error` son
 * los de `useSearchApi`.
 */
export function useSearch({ initial = '', vertical } = {}) {
  const [query, setQuery] = useState(initial)
  const text = query.trim()
  const hasQuery = text.length > 0
  const { data, loading, error, retry } = useSearchApi(query, { current: vertical })
  const events = useEvents()
  const logged = useRef(null)
  const wanted = useRef(null) // lo que la persona terminó de buscar y aún espera su respuesta

  // Para el panel, solo búsquedas terminadas (Enter, salir del campo o una sugerencia), no palabras a medio
  // escribir, y con lo que la API respondió: cuántos productos y si no hubo nada (`unmet`).
  const record = useCallback(
    (term, found) => {
      logged.current = term
      wanted.current = null
      events.track('search', {
        query: term,
        modality: 'texto',
        results: found.groups.reduce((sum, group) => sum + group.products.length, 0),
        unmet: found.unmet,
        vertical,
      })
    },
    [events, vertical],
  )

  // La respuesta de `text` está lista cuando ya no carga y trae datos (con error o con menos de 2 letras no hay).
  const ready = data !== null && !loading
  useEffect(() => {
    if (ready && wanted.current === text) record(text, data)
  }, [ready, data, text, record])

  const logSearch = (term) => {
    const clean = term.trim()
    if (!clean || clean === logged.current) return
    // Si la respuesta de lo buscado aún no llega, se registra al llegar.
    if (ready && clean === text) record(clean, data)
    else wanted.current = clean
  }

  /** Una búsqueda reciente: se escribe en el campo y se registra al llegar su respuesta. */
  const pick = (term) => {
    setQuery(term)
    logSearch(term)
  }

  return { query, setQuery, data, loading, error, retry, hasQuery, logSearch, pick }
}
