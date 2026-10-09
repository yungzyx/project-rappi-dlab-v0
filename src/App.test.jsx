import { render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { cleanup } from '@testing-library/react'
import App from './App.jsx'

afterEach(cleanup)

test('abre en el camino de verticales', () => {
  render(<App />)
  expect(screen.getByRole('region', { name: 'Camino de verticales' })).toBeTruthy()
})
