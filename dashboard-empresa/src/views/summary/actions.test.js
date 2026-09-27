import { describe, expect, test } from 'vitest'
import { pickActions } from './actions.js'
import { formatNumber } from '../../lib/format.js'
import opportunities from '../../fixtures/opportunities.synthetic.json'
import trends from '../../fixtures/trends.synthetic.json'
import kpis from '../../fixtures/kpis.synthetic.json'

const opportunity = (overrides) => ({
  vertical: 'restaurantes',
  concept_id: 'peruana',
  que: '🇵🇪 Comida peruana',
  busquedas: 10,
  usuarios: 8,
  crecimiento_pct: 20,
  accion: 'Oportunidad: sumar comercios o categoría',
  ...overrides,
})
const trend = (concept_id, crecimiento_pct) => ({
  concept_id,
  concepto: concept_id,
  recientes: 30,
  anteriores: 20,
  crecimiento_pct,
})

describe('pickActions', () => {
  test('con los datos guardados elige peruana, alimento para gatos y los usuarios en riesgo', () => {
    const actions = pickActions({ opportunities: opportunities.data, trends: trends.data, kpis: kpis.data })

    expect(actions.map((action) => action.id)).toEqual(['oportunidad', 'tendencia', 'riesgo'])
    expect(actions[0].title).toBe('🇵🇪 Comida peruana en Restaurantes')
    expect(actions[0].figure).toBe('445')
    expect(actions[0].action).toBe('Oportunidad: sumar comercios o categoría')
    // Peruana, desayunos y mexicana suben pero no tienen oferta: la tendencia accionable es alimento para gatos.
    expect(actions[1].title).toBe('🐈 Alimento para gatos')
    expect(actions[1].figure).toBe('+24%')
    expect(actions[2].figure).toBe(formatNumber(kpis.data.en_riesgo))
    expect(actions[2].detail).toContain(`${formatNumber(kpis.data.perdidos)} perdidos`)
  })

  test('la oportunidad top es la de más usuarios aunque la API la entregue en otro orden', () => {
    const rows = [opportunity({ concept_id: 'a', que: 'A', usuarios: 3 }), opportunity({ concept_id: 'b', que: 'B', usuarios: 9 })]

    const [top] = pickActions({ opportunities: rows })

    expect(top.title).toBe('B en Restaurantes')
  })

  test('una consulta sin concepto va entre comillas y el crecimiento nulo se lee como demanda nueva', () => {
    const rows = [opportunity({ concept_id: null, que: 'kombucha', vertical: 'supermercado', crecimiento_pct: null })]

    const [top] = pickActions({ opportunities: rows })

    expect(top.title).toBe('«kombucha» en Supermercado')
    expect(top.detail).toContain('nueva')
  })

  test('si todos los conceptos que suben son demanda no satisfecha, no repite la oportunidad top', () => {
    const rows = [opportunity({ concept_id: 'peruana' }), opportunity({ concept_id: 'desayuno', usuarios: 2 })]

    const actions = pickActions({ opportunities: rows, trends: [trend('peruana', 43), trend('desayuno', 35)] })

    expect(actions.find((action) => action.id === 'tendencia').title).toBe('desayuno')
  })

  test('ignora conceptos que bajan', () => {
    const actions = pickActions({ trends: [trend('pisco', -34)] })

    expect(actions).toEqual([])
  })

  test('sin usuarios en riesgo no agrega esa acción (datos del prototipo)', () => {
    const actions = pickActions({ kpis: { en_riesgo: 0, perdidos: 0 } })

    expect(actions).toEqual([])
  })
})
