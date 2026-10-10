import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { EXPLORABLE } from '../../assistant/explored'
import DiscoverSection from './DiscoverSection'

afterEach(cleanup)

test('cuenta las verticales que se pueden explorar, sin Mascotas', () => {
  render(<DiscoverSection cards={[]} explored={['grocery', 'liquor']} onOpen={() => {}} />)
  expect(EXPLORABLE).toHaveLength(8)
  expect(document.querySelector('.discover-count').textContent).toBe('Exploraste 2 de 8')
  expect(document.querySelectorAll('.discover-stamp')).toHaveLength(8)
  expect(screen.queryByRole('button', { name: /Mascotas/ })).toBeNull()
  expect(screen.getByRole('progressbar').getAttribute('aria-valuemax')).toBe('8')
})
