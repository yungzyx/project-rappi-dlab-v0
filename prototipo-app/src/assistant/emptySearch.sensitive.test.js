import { expect, test, vi } from 'vitest'

// Un tema conocido cuyos productos están sobre todo en Farmacia: Mochi no debe llevar ahí por su cuenta.
vi.mock('./tags', async (importOriginal) => ({
  ...(await importOriginal()),
  productsForTags: () => [{ vertical: 'pharmacy' }, { vertical: 'pharmacy' }, { vertical: 'pharmacy' }, { vertical: 'liquor' }],
  storesForTags: () => [],
}))

test('aunque el tema esté sobre todo en Farmacia, Mochi lleva a otra vertical (nunca a Farmacia)', async () => {
  const { emptySearch } = await import('./emptySearch')
  expect(emptySearch('chela')).toMatchObject({ vertical: 'liquor' })
})
