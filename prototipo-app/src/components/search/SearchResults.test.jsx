import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { fixture, stubApi } from '../../api/testing'
import { CartProvider } from '../../state/CartContext'
import { DemoProvider } from '../../state/DemoContext'
import { NudgeProvider } from '../../state/NudgeContext'
import { ProfileProvider } from '../../state/ProfileContext'
import { SearchResults } from './SearchSections'

function Providers({ children }) {
  return (
    <DemoProvider>
      <ProfileProvider>
        <CartProvider>
          <NudgeProvider>{children}</NudgeProvider>
        </CartProvider>
      </ProfileProvider>
    </DemoProvider>
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const EMPTY = { query: 'chela', groups: [], unmet: true, unmetReason: null }
const flush = () => act(async () => {})

describe('SearchResults sin resultados', () => {
  test('sin Mochi (el buscador de «Rappi hoy») sigue el texto de siempre y no llama a la API', async () => {
    const fetchMock = stubApi({})
    render(<SearchResults query="chela" data={EMPTY} />)
    await flush()
    expect(screen.getByText('No results for “chela”.')).toBeTruthy()
    expect(document.querySelector('.mochi')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('sin resultados muestra Ver en la vertical que sí lo tiene', async () => {
    const fetchMock = stubApi({ 'POST /mochi/offer': fixture('mochi-sin-resultado') })
    const onOpenVertical = vi.fn()
    render(<SearchResults query="pizza hawaiana" data={{ ...EMPTY, query: 'pizza hawaiana' }} onOpenVertical={onOpenVertical} />)
    await flush()

    expect(screen.getByText('No encontré «pizza hawaiana», pero pizza sí hay en restaurantes.')).toBeTruthy()
    expect(document.querySelector('.search-mochi .mochi')).toBeTruthy()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      moment: 'sin_resultado',
      context: { query: 'pizza hawaiana' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ver en Restaurantes' }))
    expect(onOpenVertical).toHaveBeenCalledWith('restaurants')
  })

  test('si Mochi no tiene nada que ofrecer (204), solo invita a probar otra búsqueda', async () => {
    stubApi({ 'POST /mochi/offer': 204 })
    const onTryAnother = vi.fn()
    render(<SearchResults query="xyzzy" data={{ ...EMPTY, query: 'xyzzy' }} onOpenVertical={() => {}} onTryAnother={onTryAnother} />)
    await flush()

    expect(screen.getByText('No encontré «xyzzy». ¿Lo buscamos con otras palabras?')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Ver en/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Probar otra búsqueda' }))
    expect(onTryAnother).toHaveBeenCalledTimes(1)
  })

  test('si la oferta falla, Mochi no dice nada de más: también solo «Probar otra búsqueda»', async () => {
    stubApi({ 'POST /mochi/offer': 'offline' })
    render(<SearchResults query="xyzzy" data={{ ...EMPTY, query: 'xyzzy' }} onOpenVertical={() => {}} onTryAnother={() => {}} />)
    await flush()
    expect(screen.getByRole('button', { name: 'Probar otra búsqueda' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Ver en/ })).toBeNull()
  })

  test('mientras se escribe otra consulta no se muestra la oferta de la anterior', async () => {
    stubApi({ 'POST /mochi/offer': fixture('mochi-sin-resultado') })
    render(<SearchResults query="pizza hawaianas" data={{ ...EMPTY, query: 'pizza hawaiana' }} loading onOpenVertical={() => {}} />)
    await flush()
    expect(screen.queryByRole('button', { name: /^Ver en/ })).toBeNull()
    expect(screen.queryByText(/No results|No encontré/)).toBeNull()
  })
})

describe('SearchResults con resultados', () => {
  const data = () => {
    const raw = fixture('search-grouped')
    const product = raw.groups[0].products[0]
    // Un grupo con más productos de los que se ven al principio.
    raw.groups[0].products = Array.from({ length: 5 }, (_, i) => ({ ...product, id: `cat-${i}`, name: `Cerveza ${i}` }))
    return {
      query: 'cerveza',
      unmet: false,
      groups: raw.groups.map((g) => ({
        vertical: g.prototype_vertical,
        backendVertical: g.vertical,
        products: g.products.map((p) => ({ id: p.id, name: p.name, price: p.price, store: p.store, storeId: p.store_id })),
      })),
    }
  }

  test('cada grupo lleva el nombre de su vertical y muestra pocos productos con «Ver más»', () => {
    render(<SearchResults query="cerveza" data={data()} />, { wrapper: Providers })
    expect(screen.getByRole('heading', { name: 'Licores' })).toBeTruthy()
    expect(screen.getByText('Cerveza 2')).toBeTruthy()
    expect(screen.queryByText('Cerveza 3')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Ver más (2)' }))
    expect(screen.getByText('Cerveza 4')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Ver más/ })).toBeNull()
  })

  test('«Ver más» vuelve a cerrarse con una consulta nueva', () => {
    const { rerender } = render(<SearchResults query="cerveza" data={data()} />, { wrapper: Providers })
    fireEvent.click(screen.getByRole('button', { name: 'Ver más (2)' }))
    expect(screen.getByText('Cerveza 4')).toBeTruthy()

    rerender(<SearchResults query="cerveza fria" data={{ ...data(), query: 'cerveza fria' }} />)
    expect(screen.queryByText('Cerveza 4')).toBeNull()
    expect(screen.getByRole('button', { name: 'Ver más (2)' })).toBeTruthy()
  })

  test('el mismo producto en varios grupos no repite llaves', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<SearchResults query="cerveza" data={data()} />, { wrapper: Providers })
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })
})
