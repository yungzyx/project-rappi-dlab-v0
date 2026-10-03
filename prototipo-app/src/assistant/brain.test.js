import { describe, expect, test } from 'vitest'
import { forVertical, forYou, greeting, photoReply, reply, suggestions } from './brain'

const EMPTY_PROFILE = { top: [] }
const BEER_PROFILE = { top: ['cerveza'] }

describe('reply', () => {
  test('una ocasión devuelve productos, tiendas y los temas que usó', () => {
    const response = reply('Voy a hacer un asado', EMPTY_PROFILE)
    expect(response.tags).toEqual(['carne', 'cerveza', 'fresco'])
    expect(response.products.length).toBeGreaterThan(0)
    expect(response.text).toMatch(/asado/i)
  })

  test('entiende "guagua" y "pañales" aunque vengan con tilde y ñ', () => {
    expect(reply('Necesito pañales para la guagua', EMPTY_PROFILE).tags).toContain('bebe')
  })

  test('las ocasiones de comida responden solo con restaurantes', () => {
    const response = reply('tengo hambre', EMPTY_PROFILE)
    expect(response.products).toEqual([])
    expect(response.stores.length).toBeGreaterThan(0)
  })

  test('los atajos llevan a pantallas', () => {
    expect(reply('quiero ir de viaje', EMPTY_PROFILE).actions[0].route).toEqual(['travel'])
    expect(reply('mis millas', EMPTY_PROFILE).actions[0].route).toEqual(['loyalty'])
  })

  test('un tema suelto sugiere su complemento de otra vertical', () => {
    const response = reply('cerveza', EMPTY_PROFILE)
    expect(response.tags).toEqual(['cerveza'])
    expect(response.suggestion?.question ?? response.reason).toMatch(/snacks/i)
  })

  test('el complemento trae productos de otra vertical, con su nombre y su pantalla', () => {
    const { suggestion } = reply('una hamburguesa', EMPTY_PROFILE)
    expect(suggestion.products.length).toBeGreaterThan(0)
    expect(suggestion.products.every((product) => product.vertical === 'liquor')).toBe(true)
    expect(suggestion).toMatchObject({ verticalLabel: 'Licores', route: ['vertical', { id: 'liquor' }] })
    expect(suggestion.reason).toMatch(/hamburguesa/i)
  })

  test('lo que no encuentra se compensa con ofertas de varias verticales, no solo restaurantes', () => {
    const response = reply('protector solar', EMPTY_PROFILE)
    const verticals = response.products.map((product) => product.vertical)
    expect(new Set(verticals).size).toBe(verticals.length) // una oferta por vertical (hoy: 3 de 6 eran restaurantes)
  })

  test('si no reconoce nada, busca por nombre en el catálogo', () => {
    const response = reply('Unimarc', EMPTY_PROFILE)
    expect(response.stores.map((store) => store.name)).toContain('Unimarc')
    expect(response.tags).toBeUndefined()
  })

  test('sin resultados, lo dice y ofrece algo igual', () => {
    const response = reply('xyzxyz', EMPTY_PROFILE)
    expect(response.text).toMatch(/no lo encontré/)
    expect(response.products.length).toBeGreaterThan(0)
  })
})

describe('personalización', () => {
  test('sin perfil, el saludo es genérico y "Para ti" muestra ofertas', () => {
    expect(greeting(EMPTY_PROFILE)).toMatch(/Soy Bigotes/)
    expect(forYou(EMPTY_PROFILE).reason).toBeNull()
  })

  test('con perfil, recomienda el complemento de su tema favorito', () => {
    const picks = forYou(BEER_PROFILE)
    expect(picks.reason).toMatch(/cerveza/i)
    expect(picks.products.length).toBeGreaterThan(0)
    expect(greeting(BEER_PROFILE)).toMatch(/cerveza/i)
  })

  test('las sugerencias pasan de genéricas a personales', () => {
    expect(suggestions(EMPTY_PROFILE)[0]).toMatch(/almuerzo/)
    const personal = suggestions(BEER_PROFILE)
    expect(personal[0]).toMatch(/Más cerveza/)
    expect(personal[1]).toMatch(/Snacks para acompañar/)
    expect(personal.length).toBeLessThanOrEqual(6)
  })

  test('la respuesta a una foto avisa que el reconocimiento es simulado', () => {
    expect(photoReply(EMPTY_PROFILE).reason).toMatch(/simulado/)
  })
})

describe('forVertical', () => {
  test('sin perfil, recomienda el complemento del tema de la vertical, de otra vertical', () => {
    const picks = forVertical('liquor', EMPTY_PROFILE)
    expect(picks.reason).toMatch(/Combina con/)
    expect(picks.products.length).toBeGreaterThan(0)
    picks.products.forEach((product) => expect(product.name).not.toMatch(/cerveza/i))
  })

  test('llena la fila aunque el tema favorito tenga un solo complemento', () => {
    expect(forVertical('liquor', { top: ['licor'] }).products.length).toBeGreaterThanOrEqual(3)
  })

  test('con perfil, parte del tema favorito y excluye lo pedido', () => {
    const all = forVertical('pharmacy', BEER_PROFILE)
    expect(all.reason).toMatch(/Porque te gusta/)
    const excluded = forVertical('pharmacy', BEER_PROFILE, new Set([all.products[0].id]))
    expect(excluded.products.map((product) => product.id)).not.toContain(all.products[0].id)
  })

  test('una vertical desconocida sin perfil no recomienda nada', () => {
    expect(forVertical('nada', EMPTY_PROFILE).products).toEqual([])
  })
})

describe('regresiones del cerebro local (se usa cuando no hay API)', () => {
  test('un saludo al inicio no tapa el pedido', () => {
    expect(reply('hola, quiero sushi', EMPTY_PROFILE).tags).toContain('sushi')
    expect(reply('hola', EMPTY_PROFILE).text).toMatch(/Soy Bigotes/)
  })

  test('saludos de varias palabras o encadenados son solo un saludo', () => {
    for (const text of ['buenas tardes', 'hola buenas', 'hola, buenas noches', 'Buenos días!']) {
      expect(reply(text, EMPTY_PROFILE).text).toMatch(/Soy Bigotes/)
    }
    expect(reply('buenas tardes, quiero sushi', EMPTY_PROFILE).tags).toContain('sushi')
  })

  test('las gracias solo se responden si vienen solas', () => {
    expect(reply('gracias', EMPTY_PROFILE).text).toMatch(/De nada/)
    expect(reply('gracias, ahora una pizza', EMPTY_PROFILE).tags).toContain('pizza')
  })

  test('palabras completas: "comercial", "equivale" y "bebestibles" no disparan nada raro', () => {
    expect(reply('algo comercial', EMPTY_PROFILE).stores ?? []).not.toContainEqual(expect.objectContaining({ name: expect.stringMatching(/burger/i) }))
    expect(reply('equivale', EMPTY_PROFILE).text).not.toMatch(/De nada/)
    expect(reply('bebestibles', EMPTY_PROFILE).tags ?? []).not.toContain('bebe')
  })

  test('lo concreto gana a la ocasión genérica: "comida para mi perro" es mascotas', () => {
    expect(reply('comida para mi perro', EMPTY_PROFILE).tags).toEqual(['mascota'])
  })
})
