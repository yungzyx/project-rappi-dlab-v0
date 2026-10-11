import { describe, expect, test } from 'vitest'
import { initialState, stampedVerticals, verticalLevel, visit, waitingRoundVertical } from './progress.js'
import { clearLegacy, legacyProgress } from './storage.js'
import { PASSPORT_ORDER, SCREEN_TO_GAME } from './verticals.js'

const CATALOG = ['supermercado', 'conveniencia', 'turbo', 'licores', 'chocolateria', 'restaurantes', 'farmacia', 'mall']

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

  test('the waiting round never picks Licores or Farmacia', () => {
    const rest = PASSPORT_ORDER.filter((v) => v !== 'licores' && v !== 'farmacia').reduce((s, v) => visit(s, v).state, initialState())
    expect(waitingRoundVertical(rest).vertical).not.toMatch(/^(licores|farmacia)$/)
    const onlyLicores = { ...initialState(), visited: PASSPORT_ORDER.filter((v) => v !== 'licores') }
    expect(waitingRoundVertical(onlyLicores).vertical).not.toBe('licores')
    // Entre las demás sin sello, Licores no es «la primera sin sello»: se salta.
    expect(waitingRoundVertical(initialState()).vertical).toBe('conveniencia')
    const skip = { ...initialState(), visited: ['supermercado', 'restaurantes', 'conveniencia', 'turbo'] }
    expect(waitingRoundVertical(skip).vertical).toBe('chocolateria')
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
    expect(PASSPORT_ORDER).toEqual([...CATALOG, 'viajes'])
  })

  test('abrir RappiTravel en la app sella Viajes', () => {
    expect(SCREEN_TO_GAME.travel).toBe('viajes')
    const { state, isNew } = visit(initialState(), 'viajes')
    expect(isNew).toBe(true)
    expect(stampedVerticals(state)).toContain('viajes')
  })

  test('Viajes puede ser la ronda mientras llega el pedido', () => {
    const allButTravel = { ...initialState(), visited: [...CATALOG] }
    expect(waitingRoundVertical(allButTravel)).toEqual({ vertical: 'viajes', isNew: true })
  })
})
