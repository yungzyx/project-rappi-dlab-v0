import { createContext, useContext, useMemo, useState } from 'react'

// "Home" es la dirección que pidió mostrar el usuario; "Work" es un ejemplo inventado para poder cambiar de dirección.
const ADDRESSES = [
  { id: 'home', label: 'Home', line: 'Casa de Rappitouille' },
  { id: 'work', label: 'Work', line: 'Avenida Apoquindo # 3000' },
]

const AddressContext = createContext(null)

export function AddressProvider({ children }) {
  const [selectedId, setSelectedId] = useState(ADDRESSES[0].id)
  const [sheetOpen, setSheetOpen] = useState(false)

  const value = useMemo(
    () => ({
      addresses: ADDRESSES,
      selected: ADDRESSES.find((address) => address.id === selectedId),
      select: setSelectedId,
      sheetOpen,
      openSheet: () => setSheetOpen(true),
      closeSheet: () => setSheetOpen(false),
    }),
    [selectedId, sheetOpen],
  )

  return <AddressContext.Provider value={value}>{children}</AddressContext.Provider>
}

export const useAddress = () => useContext(AddressContext)
