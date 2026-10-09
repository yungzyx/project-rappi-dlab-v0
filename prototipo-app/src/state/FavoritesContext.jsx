import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { loadStored, saveStored } from './storage'

const STORAGE_KEY = 'rappi-proto-favorites'
const isStoredStores = (value) =>
  Array.isArray(value) && value.every((store) => store && typeof store === 'object' && typeof store.name === 'string')

// Sin el menú real (`sections`): la pestaña solo necesita nombre y foto, y el catálogo completa el resto al abrirla.
const light = (stores) => stores.map(({ sections: _sections, ...store }) => store)

const FavoritesContext = createContext(null)

/** Tiendas que el usuario marca con ♥ en la página de tienda; se suman a "Favorite stores" y se guardan en el navegador. */
export function FavoritesProvider({ children }) {
  const [stores, setStores] = useState(() => loadStored(STORAGE_KEY, isStoredStores, []))

  useEffect(() => {
    saveStored(STORAGE_KEY, light(stores))
  }, [stores])

  const value = useMemo(
    () => ({
      stores,
      isFavorite: (name) => stores.some((store) => store.name === name),
      toggle: (store) =>
        setStores((prev) =>
          prev.some((s) => s.name === store.name) ? prev.filter((s) => s.name !== store.name) : [store, ...prev],
        ),
    }),
    [stores],
  )

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
}

export const useFavorites = () => useContext(FavoritesContext)
