import { describe, expect, test } from 'vitest'
import { DATA } from './data.js'
import { initialState, stampedVerticals, verticalLevel, visit, waitingRoundVertical } from './progress.js'
import { clearLegacy, legacyProgress } from './storage.js'
import { PASSPORT_ORDER, SCREEN_TO_GAME } from './verticals.js'

/** Almacenamiento de mentira con lo que ya había guardado. */
const memoryStorage = (items = {}) => ({
  getItem: (key) => items[key] ?? null,
  setItem: (key, value) => (items[key] = String(value)),
  removeItem: (key) => delete items[key],
})

describe('un solo pasaporte', () => {
  test('arranca con Restaurantes y Súper selladas', () => {
    expect(stampedVerticals(initialState())).toEqual(['supermercado', 'restaurantes'])
  })

  test('abrir una vertical en la app la deja en Explorador, una sola vez', () => {
    const { state, isNew } = visit(initialState(), 'turbo')
    expect(isNew).toBe(true)
    expect(verticalLevel(state, 'turbo')).toBe('explorador')
    expect(visit(state, 'turbo').isNew).toBe(false)
  })

  test('la ronda de la espera nunca es Farmacia; con todo sellado, la de menor nivel', () => {
    expect(waitingRoundVertical(initialState())).toEqual({ vertical: 'conveniencia', isNew: true })
    const all = PASSPORT_ORDER.reduce((s, v) => visit(s, v).state, initialState())
    expect(waitingRoundVertical(all)).toEqual({ vertical: 'supermercado', isNew: false })
  })

  test('con todo sellado salvo Farmacia, no la ofrece', () => {
    const allButPharmacy = PASSPORT_ORDER.filter((v) => v !== 'farmacia').reduce((s, v) => visit(s, v).state, initialState())
    expect(waitingRoundVertical(allButPharmacy).vertical).not.toBe('farmacia')
  })

  test('traspasa el pasaporte viejo una vez y tolera basura', () => {
    const storage = memoryStorage({ 'rappi-proto-pasaporte': '["grocery","liquor","pet","x"]' })
    expect(legacyProgress(storage).visited.sort()).toEqual(['licores', 'supermercado'])
    expect(legacyProgress(memoryStorage({ 'rappi-proto-juego-v1': '{"version":1,"visited":"no"}' }))).toBeNull()
    expect(legacyProgress(memoryStorage({ 'rappi-proto-pasaporte': '{"roto":true}' }))).toBeNull()
  })

  test('con progreso guardado, ignora el pasaporte viejo y descarta verticales desconocidas', () => {
    const saved = { ...initialState(), visited: ['turbo', 'mascotas'] }
    const storage = memoryStorage({
      'rappi-proto-juego-v1': JSON.stringify(saved),
      'rappi-proto-pasaporte': '["liquor"]',
    })
    expect(legacyProgress(storage).visited).toEqual(['turbo'])
  })

  test('el traspaso es de una sola vez: borrado el pasaporte viejo, no vuelve', () => {
    const storage = memoryStorage({ 'rappi-proto-pasaporte': '["grocery","liquor","turbo","express"]' })
    expect(legacyProgress(storage).visited).toHaveLength(4)
    clearLegacy(storage)
    expect(storage.getItem('rappi-proto-pasaporte')).toBeNull()
    expect(legacyProgress(storage)).toBeNull()
  })
})

describe('Viajes en el pasaporte', () => {
  test('el pasaporte tiene 9 sellos: las 8 del catálogo y, al final, Viajes', () => {
    expect(PASSPORT_ORDER).toEqual([...DATA.order, 'viajes'])
  })

  test('abrir RappiTravel en la app sella Viajes', () => {
    expect(SCREEN_TO_GAME.travel).toBe('viajes')
    const { state, isNew } = visit(initialState(), 'viajes')
    expect(isNew).toBe(true)
    expect(stampedVerticals(state)).toContain('viajes')
  })

  test('Viajes puede ser la ronda mientras llega el pedido', () => {
    const allButTravel = { ...initialState(), visited: [...DATA.order] }
    expect(waitingRoundVertical(allButTravel)).toEqual({ vertical: 'viajes', isNew: true })
  })
})
