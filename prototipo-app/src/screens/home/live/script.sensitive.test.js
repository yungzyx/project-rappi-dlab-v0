import { expect, test, vi } from 'vitest'

// Complementos de la cerveza que están sobre todo en Farmacia: la invitación nunca lleva ahí.
vi.mock('../../../assistant/tags', async (importOriginal) => ({
  ...(await importOriginal()),
  productsForTags: () => [
    { id: 'f1', name: 'Uno', vertical: 'pharmacy' },
    { id: 'f2', name: 'Dos', vertical: 'pharmacy' },
    { id: 'f3', name: 'Tres', vertical: 'pharmacy' },
    { id: 'g1', name: 'Cuatro', vertical: 'grocery' },
    { id: 'g2', name: 'Cinco', vertical: 'grocery' },
  ],
  storesForTags: () => [],
}))

test('discoveryFor nunca invita a Farmacia, aunque ahí haya más', async () => {
  const { discoveryFor } = await import('./script')
  expect(discoveryFor({ tag: 'cerveza', vertical: 'liquor' }).vertical).toBe('grocery')
})
