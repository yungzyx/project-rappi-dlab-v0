import { describe, expect, test } from 'vitest'
import { demandLabel, describeFallbacks, plural, verticalLabel } from './labels.js'

describe('describeFallbacks', () => {
  test('nombra la consulta y el motivo', () => {
    expect(describeFallbacks([{ name: 'weekly', reason: 'no respondió en 30 s' }])).toBe(
      'serie semanal (no respondió en 30 s)',
    )
  })

  test('resume listas largas y no repite motivos', () => {
    const fallbacks = ['kpis', 'trends', 'funnel', 'cohorts', 'catalog'].map((name) => ({ name, reason: 'no responde' }))

    expect(describeFallbacks(fallbacks)).toBe('indicadores, tendencias y 3 más (no responde)')
  })

  test('une dos consultas con «y» y junta motivos distintos', () => {
    const fallbacks = [
      { name: 'weekly', reason: 'no respondió en 30 s' },
      { name: 'kpis', reason: 'respondió 500' },
    ]

    expect(describeFallbacks(fallbacks)).toBe('serie semanal y indicadores (no respondió en 30 s; respondió 500)')
  })
})

describe('etiquetas', () => {
  test('verticales del backend con nombre visible, y el código si no se conoce', () => {
    expect(verticalLabel('mall')).toBe('Rappi Mall')
    expect(verticalLabel('chocolateria')).toBe('Chocolatería')
    expect(verticalLabel('nuevo')).toBe('nuevo')
  })

  test('demandLabel cita la consulta cuando no hay concepto', () => {
    expect(demandLabel({ concept_id: 'peruana', que: '🇵🇪 Comida peruana' })).toBe('🇵🇪 Comida peruana')
    expect(demandLabel({ concept_id: null, que: 'kombucha' })).toBe('«kombucha»')
  })

  test('plural', () => {
    expect(`1 ${plural(1, 'tienda')}`).toBe('1 tienda')
    expect(`8 ${plural(8, 'tienda')}`).toBe('8 tiendas')
  })
})
