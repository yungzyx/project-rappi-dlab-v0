// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

// La hoja real (en los tests, Vite no procesa el CSS importado).
const css = readFileSync(new URL('./assistant.css', import.meta.url), 'utf8')

// Contraste WCAG entre dos colores #rrggbb.
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('contraste', () => {
  test('la etiqueta "De otra tienda" (11 px) cumple AA: 4,5:1 sobre su fondo', () => {
    const rule = css.match(/\.chat-suggestion-tag \{([^}]*)\}/)[1]
    // Valor final de la propiedad (los tokens var(--x, #fallback) no están definidos: vale el respaldo).
    const value = (property) => rule.match(new RegExp(`\\s${property}:[^;]*?(#[0-9a-f]{6})`, 'i'))[1]
    expect(contrast(value('color'), value('background'))).toBeGreaterThanOrEqual(4.5)
  })
})
