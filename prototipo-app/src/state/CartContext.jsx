import { createContext, useCallback, useContext, useMemo, useState } from 'react'

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

  const setQty = useCallback((product, qty) => {
    setLines((prev) => {
      const { [product.id]: _removed, ...rest } = prev
      return qty > 0 ? { ...rest, [product.id]: { product, qty } } : rest
    })
  }, [])

  const value = useMemo(() => {
    const items = Object.values(lines)
    const count = items.reduce((sum, line) => sum + line.qty, 0)
    const total = items.reduce((sum, line) => sum + line.qty * parsePrice(line.product.price), 0)
    return {
      items,
      count,
      total,
      qtyOf: (id) => lines[id]?.qty ?? 0,
      add: (product) => setQty(product, (lines[product.id]?.qty ?? 0) + 1),
      remove: (product) => setQty(product, (lines[product.id]?.qty ?? 0) - 1),
      clear: () => setLines({}),
    }
  }, [lines, setQty])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export const useCart = () => useContext(CartContext)
