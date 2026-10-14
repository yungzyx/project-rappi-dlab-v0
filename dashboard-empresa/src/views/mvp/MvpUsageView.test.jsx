import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from '../../App.jsx'
import { apiDown, renderWithData, resetApi, serveFixtures } from '../../test/fixtureApi.js'
import { MvpUsageView } from './MvpUsageView.jsx'

const NOT_EVIDENCE = 'uso del MVP, pocas personas: no es evidencia'

/** La API responde con los fixtures, salvo lo que se le pase (`overrides`: nombre de la métrica → cuerpo). */
function serveWith(overrides) {
  serveFixtures()
  const fixtures = globalThis.fetch
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const name = new URL(url).pathname.replace('/analytics/', '')
      return name in overrides ? { ok: true, status: 200, json: async () => overrides[name] } : fixtures(url)
    }),
  )
}

describe('MvpUsageView', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {}) // el límite de error de un bloque lo registra
  })

  afterEach(resetApi)

  test('the MVP view shows the three sections', async () => {
    serveFixtures()
    await renderWithData(<MvpUsageView source="prototype" />)

    expect(screen.getByRole('heading', { name: 'Ofertas del agente por momento' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Juego' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Búsquedas sin resultado' })).toBeTruthy()

    const offers = await screen.findByRole('table', { name: 'Ofertas del agente por momento' })
    expect(within(offers).getByText('Plan')).toBeTruthy()
    expect(within(offers).getByText('Carro')).toBeTruthy()
    const game = await screen.findByRole('table', { name: 'Juego por vertical' })
    expect(within(game).getByText('Supermercado')).toBeTruthy()
    const unmet = await screen.findByRole('table', { name: 'Búsquedas sin resultado por vertical y concepto' })
    expect(within(unmet).getByText('Supermercado')).toBeTruthy()
    expect(within(unmet).getByText('Sin concepto reconocido')).toBeTruthy()
    expect(screen.getByText('1 de 1 búsqueda sin resultado')).toBeTruthy()
  })

  test('prototype sections carry the not-evidence label and the people count', async () => {
    serveFixtures()
    await renderWithData(<MvpUsageView source="prototype" />)

    expect(screen.getAllByText(NOT_EVIDENCE)).toHaveLength(3)
    expect((await screen.findAllByText('1 persona')).length).toBe(3)
    expect(screen.queryByText(/datos simulados/i)).toBeNull()
  })

  test('rates show a dash under the minimum', async () => {
    serveFixtures()
    await renderWithData(<MvpUsageView source="prototype" />)

    const offers = await screen.findByRole('table', { name: 'Ofertas del agente por momento' })
    const [, plan] = within(offers).getAllByRole('row')
    expect(within(plan).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Plan', '1', '1', '—'])
    const stars = screen.getByText('Estrellas promedio (de 0 a 3)').closest('div')
    expect(within(stars).getByText('—')).toBeTruthy()
  })

  test('a rate and an average that the backend does compute are shown', async () => {
    serveWith({
      offers: {
        source: 'prototype',
        data: { personas: 4, momentos: [{ momento: 'checkout', mostradas: 12, aceptadas: 3, aceptacion_pct: 25 }] },
      },
      game: {
        source: 'prototype',
        data: { personas: 3, rondas: 6, estrellas_promedio: 2.5, tarjetas: 9, por_vertical: [{ vertical_juego: 'viajes', rondas: 6, tarjetas: 9 }] },
      },
    })
    await renderWithData(<MvpUsageView source="prototype" />)

    const offers = await screen.findByRole('table', { name: 'Ofertas del agente por momento' })
    expect(within(offers).getByText('Antes de pagar')).toBeTruthy()
    expect(within(offers).getByText('25,0%')).toBeTruthy()
    expect(await screen.findByText('2,5')).toBeTruthy()
    expect(within(await screen.findByRole('table', { name: 'Juego por vertical' })).getByText('Viajes')).toBeTruthy()
  })

  test('the taste-profile moment has its own label and is not counted as «sin momento»', async () => {
    serveWith({
      offers: {
        source: 'prototype',
        data: {
          personas: 2,
          momentos: [
            { momento: 'perfil', mostradas: 3, aceptadas: 1, aceptacion_pct: null },
            { momento: 'sin_momento', mostradas: 1, aceptadas: 0, aceptacion_pct: null },
          ],
        },
      },
    })
    await renderWithData(<MvpUsageView source="prototype" />)

    const offers = await screen.findByRole('table', { name: 'Ofertas del agente por momento' })
    const rows = within(offers).getAllByRole('row').slice(1)
    expect(rows.map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent))).toEqual([
      ['Perfil de gusto', '3', '1', '—'],
      ['Sin momento', '1', '0', '—'],
    ])
    expect(within(offers).queryByText('perfil')).toBeNull()
  })

  test('a search without vertical says so, the stars label gives the scale and the offers note names the tab', async () => {
    serveWith({
      unmet: {
        source: 'prototype',
        data: { personas: 1, busquedas: 2, sin_resultado: 2, por_vertical: [{ vertical: null, concepto: null, sin_resultado: 2 }] },
      },
    })
    await renderWithData(<MvpUsageView source="prototype" />)

    const unmet = await screen.findByRole('table', { name: 'Búsquedas sin resultado por vertical y concepto' })
    expect(within(unmet).getByText('Sin vertical')).toBeTruthy()
    expect(await screen.findByText('Estrellas promedio (de 0 a 3)')).toBeTruthy()
    expect(screen.getByText(/en «Entre verticales»/)).toBeTruthy()
  })

  test('synthetic sections say they are simulated, with the empty states for what the simulator lacks', async () => {
    serveFixtures()
    await renderWithData(<MvpUsageView source="synthetic" />)

    // offers: only «sin momento» → the simulator does not record the moment; game: all zeros.
    expect(await screen.findByText('Los datos simulados no registran el momento de la oferta')).toBeTruthy()
    expect(await screen.findByText('Los datos simulados no incluyen el juego')).toBeTruthy()
    expect(screen.queryByRole('table', { name: 'Ofertas del agente por momento' })).toBeNull()
    // unmet has data and is labelled as simulated, never as MVP use.
    const unmet = await screen.findByRole('table', { name: 'Búsquedas sin resultado por vertical y concepto' })
    expect(within(unmet).getByText('🥛 Leche y yogur')).toBeTruthy()
    expect(screen.getByText('118 de 219 búsquedas sin resultado')).toBeTruthy()
    expect(screen.getAllByText(/Datos simulados/)).toHaveLength(3)
    expect(screen.queryByText(NOT_EVIDENCE)).toBeNull()
  })

  test('synthetic offers with real moments still show them as a table', async () => {
    serveWith({
      offers: {
        source: 'synthetic',
        data: { personas: 9, momentos: [{ momento: 'plan', mostradas: 20, aceptadas: 5, aceptacion_pct: 25 }] },
      },
    })
    await renderWithData(<MvpUsageView source="synthetic" />)

    const offers = await screen.findByRole('table', { name: 'Ofertas del agente por momento' })
    expect(within(offers).getByText('Plan')).toBeTruthy()
  })

  test('con la API caída y fuente prototipo no aparecen cifras guardadas', async () => {
    window.history.replaceState(null, '', '/?vista=mvp&fuente=prototipo')
    apiDown()
    await renderWithData(<App />)

    const errors = await screen.findAllByText('La API no responde: el uso del MVP solo se ve con la base viva.')
    expect(errors).toHaveLength(4) // un ErrorState por bloque y otro en la fecha de corte de la cabecera
    expect(screen.queryByRole('table', { name: 'Ofertas del agente por momento' })).toBeNull()
    expect(screen.queryByRole('table', { name: 'Juego por vertical' })).toBeNull()
    expect(screen.queryByText('1 persona')).toBeNull()
    expect(screen.queryByText('Modo sin conexión (datos guardados):')).toBeNull() // no hay nada guardado que avisar
  })

  test('el bloque simulado sin conexión muestra su origen', async () => {
    apiDown()
    await renderWithData(<MvpUsageView source="synthetic" />)

    await screen.findByRole('table', { name: 'Búsquedas sin resultado por vertical y concepto' })
    const origin = (await import('../../fixtures/unmet.synthetic.json')).default.guardado
    expect(screen.getAllByText(`Guardado sin conexión: ${origin.origen} (${origin.fecha}).`).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Guardado sin conexión:/)).toHaveLength(3) // uno por bloque
  })

  test('con la API viva no hay rótulo de guardado', async () => {
    serveFixtures()
    await renderWithData(<MvpUsageView source="synthetic" />)

    await screen.findByRole('table', { name: 'Búsquedas sin resultado por vertical y concepto' })
    expect(screen.queryByText(/Guardado sin conexión/)).toBeNull()
  })

  test('switching source refetches and never mixes', async () => {
    window.history.replaceState(null, '', '/?vista=mvp')
    serveFixtures()
    await renderWithData(<App />)
    expect(await screen.findByText('🥛 Leche y yogur')).toBeTruthy()
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/analytics/unmet?source=synthetic'), expect.anything())

    await act(async () => fireEvent.click(screen.getByRole('radio', { name: 'Prototipo' })))

    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/analytics/unmet?source=prototype'), expect.anything())
    expect(await screen.findByText('1 de 1 búsqueda sin resultado')).toBeTruthy()
    expect(screen.queryByText('🥛 Leche y yogur')).toBeNull()
    expect(screen.queryByText('92 de 156 búsquedas sin resultado')).toBeNull()
  })

  test('a response from the other source is discarded instead of shown', async () => {
    const synthetic = (await import('../../fixtures/unmet.synthetic.json')).default
    serveWith({ unmet: synthetic }) // la API contesta «simulado» a todo, también a ?source=prototype
    await renderWithData(<MvpUsageView source="prototype" />)

    expect(await screen.findByText('La API no responde: el uso del MVP solo se ve con la base viva.')).toBeTruthy()
    expect(screen.queryByText('🥛 Leche y yogur')).toBeNull()
    expect(screen.queryByText('1 de 1 búsqueda sin resultado')).toBeNull() // tampoco cae a lo guardado
  })
})
