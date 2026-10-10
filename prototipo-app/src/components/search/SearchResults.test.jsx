import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { SearchResults } from './SearchSections'

afterEach(cleanup)

const EMPTY = { stores: [], products: [] }

test('sin Mochi (el buscador de «Rappi hoy») sigue el texto de siempre', () => {
  render(<SearchResults query="chela" results={EMPTY} isEmpty />)
  expect(screen.getByText('No results for “chela”.')).toBeTruthy()
  expect(document.querySelector('.mochi')).toBeNull()
})
