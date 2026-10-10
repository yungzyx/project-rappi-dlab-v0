import { useEffect } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { AssistantProvider, useAssistant } from '../state/AssistantContext'
import { CartProvider } from '../state/CartContext'
import { DemoProvider } from '../state/DemoContext'
import { ProductSheetProvider, useProductSheet } from '../state/ProductSheetContext'
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

describe('preguntarle a Mochi por un producto', () => {
  const probe = {}
  function Probe() {
    const assistant = useAssistant()
    const sheet = useProductSheet()
    useEffect(() => {
      probe.assistant = assistant
      probe.sheet = sheet
    })
    return null
  }
  const renderCard = (mode = 'final') => {
    localStorage.setItem('rappi-proto-demo-mode', mode)
    cleanup() // el test de +18 de arriba deja su tarjeta montada
    const view = render(
      <DemoProvider>
        <AssistantProvider>
          <CartProvider>
            <ProductSheetProvider>
              <ProductCard product={beer} />
              <Probe />
            </ProductSheetProvider>
          </CartProvider>
        </AssistantProvider>
      </DemoProvider>,
    )
    main = () => view.container.querySelector('.product-card-main')
    return view
  }
  let main
  const hold = () => {
    fireEvent.pointerDown(main(), { clientX: 0, clientY: 0 })
    act(() => vi.advanceTimersByTime(500))
    fireEvent.pointerUp(main())
    fireEvent.click(main()) // el toque que sigue al soltar
  }

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    localStorage.clear()
  })

  test('mantener presionado muestra «Preguntarle a Mochi» y no abre la hoja', () => {
    vi.useFakeTimers()
    renderCard()
    hold()
    expect(screen.getByRole('button', { name: 'Preguntarle a Mochi' })).toBeTruthy()
    expect(probe.sheet.isOpen).toBe(false)
  })

  test('«Preguntarle a Mochi» abre el buscador con «¿Con qué acompaño …?»', () => {
    vi.useFakeTimers()
    renderCard()
    hold()
    fireEvent.click(screen.getByRole('button', { name: 'Preguntarle a Mochi' }))
    expect(probe.assistant.session.query).toBe(`¿Con qué acompaño ${beer.name}?`)
  })

  test('en «Rappi hoy» mantener presionado no hace nada (y el toque abre la hoja como siempre)', () => {
    vi.useFakeTimers()
    renderCard('actual')
    hold()
    expect(screen.queryByRole('button', { name: 'Preguntarle a Mochi' })).toBeNull()
    expect(probe.sheet.isOpen).toBe(true)
  })
})
