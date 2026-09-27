import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useRemoteForYou } from './useRemoteForYou'

const api = vi.hoisted(() => ({ health: vi.fn(), recommendations: vi.fn() }))
vi.mock('./client', async (importOriginal) => ({ ...(await importOriginal()), ...api }))

const ROW = {
  reason: 'Porque te interesa 🍺 cerveza',
  concept: 'snacks-salados',
  vertical: 'supermercado',
  products: [{ id: 'cat-1', name: 'Papas Lays', price: '$1.990', entity_type: 'catalog_item', entity_id: '1', vertical: 'supermercado' }],
}

describe('"Para ti" desde rappi-ia', () => {
  beforeEach(() => {
    api.health.mockResolvedValue({ voz: true })
    api.recommendations.mockResolvedValue({ rows: [ROW] })
  })

  test('con API y algo aprendido, la fila viene de rappi-ia y sus productos cuentan como sugerencia', async () => {
    const { result } = renderHook(() => useRemoteForYou(true))
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current.reason).toBe('Porque te interesa 🍺 cerveza')
    expect(result.current.products[0]).toMatchObject({ entityId: '1', fromSuggestion: true, suggestionOrigin: 'para-ti' })
  })

  test('sin API, sin nada aprendido o en modo "Rappi hoy" queda la fila local (null)', async () => {
    api.recommendations.mockResolvedValue({ rows: [] })
    const empty = renderHook(() => useRemoteForYou(true))
    await waitFor(() => expect(api.recommendations).toHaveBeenCalled())
    expect(empty.result.current).toBeNull()

    api.health.mockResolvedValue(null)
    api.recommendations.mockClear()
    const offline = renderHook(() => useRemoteForYou(true))
    await waitFor(() => expect(api.health).toHaveBeenCalled())
    expect(offline.result.current).toBeNull()
    expect(api.recommendations).not.toHaveBeenCalled()

    api.health.mockClear()
    renderHook(() => useRemoteForYou(false))
    expect(api.health).not.toHaveBeenCalled()
  })
})
