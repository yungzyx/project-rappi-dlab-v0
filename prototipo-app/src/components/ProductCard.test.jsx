import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { CartProvider } from '../state/CartContext'
import { ProductCard } from './ProductCard'

const beer = { id: 'cat-1', name: 'Corona Cerveza Rubia Extra', img: '', price: '$2.200', store: 'Casanova spa', storeBadge: '#333' }

test('un producto +18 lleva la marca en la tarjeta (la fila "Para ti" de la API puede traer alcohol)', () => {
  const { rerender } = render(
    <CartProvider>
      <ProductCard product={{ ...beer, ageRestricted: true }} />
    </CartProvider>,
  )
  expect(screen.getByLabelText('Solo mayores de 18').textContent).toBe('+18')
  rerender(
    <CartProvider>
      <ProductCard product={beer} />
    </CartProvider>,
  )
  expect(screen.queryByLabelText('Solo mayores de 18')).toBeNull()
})
