import { render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { cleanup } from '@testing-library/react'
import App from './App.jsx'

afterEach(cleanup)

test('muestra el nombre del juego', () => {
  render(<App />)
  expect(screen.getByText('Juego de verticales')).toBeTruthy()
})
