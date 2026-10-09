import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { SuggestionPerformance } from './SuggestionPerformance.jsx'

const DEMO_ROW = {
  concepto: '🥤 Bebidas gaseosas',
  vertical: 'licores',
  mostradas: 2,
  aceptadas: 1,
  ignoradas: 0,
  convertidas: 1,
  aceptacion_pct: null,
}

describe('SuggestionPerformance', () => {
  afterEach(cleanup)

  test('con una muestra chica (demo en vivo) muestra los conteos pero no inventa porcentajes', () => {
    render(<SuggestionPerformance rows={[DEMO_ROW]} />)
    expect(screen.getAllByText('Bebidas gaseosas', { exact: false }).length).toBeGreaterThan(0)
    expect(screen.queryByText(/50(,0)?%/)).toBeNull()
    expect(screen.queryByText(/100(,0)?%/)).toBeNull()
    expect(screen.getByText(/aparece desde 10 mostradas/)).toBeTruthy()
  })
})
