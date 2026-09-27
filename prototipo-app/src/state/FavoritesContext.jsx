import { createContext, useContext, useMemo, useState } from 'react'

const FavoritesContext = createContext(null)

/** Tiendas que el usuario marca con ♥ en la página de tienda; se suman a "Favorite stores". */
export function FavoritesProvider({ children }) {
  const [stores, setStores] = useState([])

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
