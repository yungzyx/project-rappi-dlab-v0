import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const newCartId = () => `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

const CartContext = createContext(null)

/** "$10.990" → 10990 (precios chilenos con punto de miles). */
export function parsePrice(text) {
  return Number(String(text).replace(/[^\d]/g, '')) || 0
}

export function formatPrice(value) {
  return `$${value.toLocaleString('es-CL')}`
}

/** Carrito del prototipo: productos por id con su cantidad. Vive en memoria mientras la página esté abierta. */
export function CartProvider({ children }) {
  const [lines, setLines] = useState({})
  const [cartId, setCartId] = useState(newCartId)

  // `delta` sobre el estado vigente: dos toques rápidos suman 2 aunque el render aún no se actualice.
  const change = useCallback((product, delta) => {
    setLines((prev) => {
      const qty = (prev[product.id]?.qty ?? 0) + delta
      const { [product.id]: _removed, ...rest } = prev
      return qty > 0 ? { ...rest, [product.id]: { product, qty } } : rest
    })
  }, [])

  const value = useMemo(() => {
    const items = Object.values(lines)
    const count = items.reduce((sum, line) => sum + line.qty, 0)
    const total = items.reduce((sum, line) => sum + line.qty * parsePrice(line.product.price), 0)
    return {
      id: cartId,
      items,
      count,
      total,
      qtyOf: (id) => lines[id]?.qty ?? 0,
      add: (product) => change(product, 1),
      remove: (product) => change(product, -1),
      // Tras un pedido, el carro siguiente es otro (el abandono se mide por carro).
      clear: () => {
        setLines({})
        setCartId(newCartId())
      },
    }
  }, [lines, change, cartId])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export const useCart = () => useContext(CartContext)
