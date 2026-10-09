import { describe, expect, test } from 'vitest'
import { DATA } from './data.js'
import { initialState, stampedVerticals, verticalLevel, visit, waitingRoundVertical } from './progress.js'
import { load } from './storage.js'

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
    const all = DATA.order.reduce((s, v) => visit(s, v).state, initialState())
    expect(waitingRoundVertical(all)).toEqual({ vertical: 'supermercado', isNew: false })
  })

  test('con todo sellado salvo Farmacia, no la ofrece', () => {
    const allButPharmacy = DATA.order.filter((v) => v !== 'farmacia').reduce((s, v) => visit(s, v).state, initialState())
    expect(waitingRoundVertical(allButPharmacy).vertical).not.toBe('farmacia')
  })

  test('traspasa el pasaporte viejo una vez y tolera basura', () => {
    const storage = memoryStorage({ 'rappi-proto-pasaporte': '["grocery","liquor","pet","x"]' })
    expect(load(storage).visited.sort()).toEqual(['licores', 'supermercado'])
    expect(load(memoryStorage({ 'rappi-proto-juego-v1': '{"version":1,"visited":"no"}' }))).toEqual(initialState())
    expect(load(memoryStorage({ 'rappi-proto-pasaporte': '{"roto":true}' }))).toEqual(initialState())
  })

  test('con progreso guardado, ignora el pasaporte viejo y descarta verticales desconocidas', () => {
    const saved = { ...initialState(), visited: ['turbo', 'mascotas'] }
    const storage = memoryStorage({
      'rappi-proto-juego-v1': JSON.stringify(saved),
      'rappi-proto-pasaporte': '["liquor"]',
    })
    expect(load(storage).visited).toEqual(['turbo'])
  })
})
