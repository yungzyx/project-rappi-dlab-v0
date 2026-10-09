import { useEffect, useState } from 'react'

// La vista y la fuente viven en la URL (?vista=oportunidades&fuente=prototipo) para compartir un enlace exacto.
const SOURCE_PARAMS = { synthetic: 'simulados', prototype: 'prototipo' }

export function readUrlState(search, viewIds) {
  const params = new URLSearchParams(search)
  const view = viewIds.includes(params.get('vista')) ? params.get('vista') : viewIds[0]
  const source = params.get('fuente') === SOURCE_PARAMS.prototype ? 'prototype' : 'synthetic'
  return { view, source }
}

export function useUrlState(viewIds) {
  const [state, setState] = useState(() => readUrlState(window.location.search, viewIds))

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set('vista', state.view)
    params.set('fuente', SOURCE_PARAMS[state.source])
    window.history.replaceState(null, '', `?${params}${window.location.hash}`)
  }, [state])

  return [state, setState]
}
