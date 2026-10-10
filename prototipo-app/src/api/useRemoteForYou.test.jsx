import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

let useRemoteForYou
let firstShowing

const api = vi.hoisted(() => ({ health: vi.fn(), recommendations: vi.fn() }))
vi.mock('./client', async (importOriginal) => ({ ...(await importOriginal()), ...api }))
const { toPrototypeProduct } = await vi.importActual('./client')

const ROW = {
  reason: 'Porque te interesa 🍺 cerveza',
  concept: 'snacks-salados',
  vertical: 'supermercado',
  products: [
    {
      id: 'cat-1',
      name: 'Papas Lays',
      price: '$1.990',
      entity_type: 'catalog_item',
      entity_id: '1',
      vertical: 'supermercado',
    },
  ],
}

describe('"Para ti" desde rappi-ia', () => {
  beforeEach(async () => {
    vi.resetModules() // la fila y lo ya mostrado viven en el módulo (lo que dura la pestaña)
    ;({ useRemoteForYou, firstShowing } = await import('./useRemoteForYou'))
    vi.clearAllMocks()
    api.health.mockResolvedValue({ voz: true })
    // `recommendations` ya entrega los productos en el formato del prototipo.
    api.recommendations.mockResolvedValue({ rows: [{ ...ROW, products: ROW.products.map(toPrototypeProduct) }] })
  })

  test('con API y algo aprendido, la fila viene de rappi-ia y sus productos cuentan como sugerencia', async () => {
    const { result } = renderHook(() => useRemoteForYou(true))
    await waitFor(() => expect(result.current.row).not.toBeNull())
    expect(result.current.row.reason).toBe('Porque te interesa 🍺 cerveza')
    expect(result.current.row.products[0]).toMatchObject({
      entityId: '1',
      fromSuggestion: true,
      suggestionOrigin: 'para-ti',
    })
  })

  test('tras "Olvidar" (otra generación del perfil) la fila pedida antes ya no se muestra', async () => {
    const { result, rerender } = renderHook(({ generation }) => useRemoteForYou(true, generation), {
      initialProps: { generation: 0 },
    })
    await waitFor(() => expect(result.current.row).not.toBeNull())
    rerender({ generation: 1 })
    // Queda la fila local, y fija: no se vuelve a pedir (el servidor quizá aún no borró).
    expect(result.current).toEqual({ row: null, pending: false })
    expect(api.recommendations).toHaveBeenCalledTimes(1)
  })

  test('sin API, sin nada aprendido o en modo "Rappi hoy" queda la fila local (row null, ya sin esperar)', async () => {
    api.recommendations.mockResolvedValue({ rows: [] })
    const empty = renderHook(() => useRemoteForYou(true))
    await waitFor(() => expect(empty.result.current.pending).toBe(false))
    expect(empty.result.current.row).toBeNull()

    api.health.mockResolvedValue(null)
    api.recommendations.mockClear()
    const offline = renderHook(() => useRemoteForYou(true))
    await waitFor(() => expect(offline.result.current.pending).toBe(false))
    expect(offline.result.current.row).toBeNull()
    expect(api.recommendations).not.toHaveBeenCalled()

    api.health.mockClear()
    const off = renderHook(() => useRemoteForYou(false))
    expect(off.result.current).toEqual({ row: null, pending: false })
    expect(api.health).not.toHaveBeenCalled()
  })

  test('mientras rappi-ia no contesta, la fila local es provisoria (pending)', async () => {
    let answer
    api.recommendations.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const { result } = renderHook(() => useRemoteForYou(true))
    expect(result.current).toEqual({ row: null, pending: true })
    await waitFor(() => expect(api.recommendations).toHaveBeenCalled())
    expect(result.current.pending).toBe(true)

    answer({ rows: [] }) // usuario nuevo (o tras «Olvidar»): la fila local queda
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(result.current.row).toBeNull()
  })

  test('volver a la Home no vuelve a pedir la fila: se reusa la de esta pestaña', async () => {
    const first = renderHook(() => useRemoteForYou(true))
    await waitFor(() => expect(first.result.current.row).not.toBeNull())
    first.unmount() // abrir una tienda desmonta la Home

    const again = renderHook(() => useRemoteForYou(true))

    expect(again.result.current).toMatchObject({ row: { concept: 'snacks-salados' }, pending: false })
    expect(api.recommendations).toHaveBeenCalledTimes(1)
  })

  test('cada sugerencia «para ti» cuenta como mostrada una vez por pestaña, no en cada visita a la Home', () => {
    const row = { concept: 'snacks-salados', vertical: 'supermercado', generation: 0 }

    expect(firstShowing(row)).toBe(true)
    expect(firstShowing(row)).toBe(false) // cinco visitas y una compra no son 20 % de aceptación
    expect(firstShowing({ ...row, generation: 1 })).toBe(true) // tras «Olvidar» es otra sugerencia
  })

  test('la vertical cuenta igual como código del backend que como id del prototipo', () => {
    const row = { concept: 'cerveza', origin: 'chat', generation: 0 }

    expect(firstShowing({ ...row, vertical: 'licores' })).toBe(true) // la sugerencia del chat
    expect(firstShowing({ ...row, vertical: 'liquor' })).toBe(false) // sus productos, al aceptarla
    expect(firstShowing({ ...row, vertical: 'supermercado' })).toBe(true) // otra vertical sigue siendo otra
  })
})
