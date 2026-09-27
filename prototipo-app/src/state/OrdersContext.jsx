import { createContext, useCallback, useContext, useMemo, useState } from 'react'

// Pedidos hechos en la demo. Se guardan en el navegador para que el seguimiento sobreviva a una recarga.
const STORAGE_KEY = 'rappi-proto-orders'
const MAX_ORDERS = 10

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []
  } catch {
    return []
  }
}

function save(orders) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders))
  } catch {
    // Sin almacenamiento: los pedidos viven solo en memoria.
  }
}

const OrdersContext = createContext(null)

export function OrdersProvider({ children }) {
  const [orders, setOrders] = useState(load)

  /** Crea el pedido y devuelve su id. `placedAt` marca el inicio del seguimiento. */
  const place = useCallback((order) => {
    const created = { ...order, id: `order-${Date.now()}`, placedAt: Date.now() }
    setOrders((prev) => {
      const next = [created, ...prev].slice(0, MAX_ORDERS)
      save(next)
      return next
    })
    return created.id
  }, [])

  const value = useMemo(
    () => ({ orders, place, find: (id) => orders.find((order) => order.id === id) }),
    [orders, place],
  )

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
}

export const useOrders = () => useContext(OrdersContext)
