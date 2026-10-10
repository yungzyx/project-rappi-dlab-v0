import { expect, test } from 'vitest'
import { emptySearch } from './emptySearch'

test('«chela» lleva a la vertical con más cerveza', () => {
  expect(emptySearch('chela heladita')).toMatchObject({ tag: 'cerveza', vertical: 'liquor', verticalName: 'Licores' })
})

test('algo de farmacia nunca se ofrece', () => {
  expect(emptySearch('cruz verde')).toBeNull()
  expect(emptySearch('pampers')).toBeNull()
})

test('una palabra sin tema da null', () => {
  expect(emptySearch('xyzzy')).toBeNull()
  expect(emptySearch('   ')).toBeNull()
})
