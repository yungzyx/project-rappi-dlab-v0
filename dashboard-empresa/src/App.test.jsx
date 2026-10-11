import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from './App.jsx'
import { apiDown, renderWithData, resetApi, serveFixtures } from './test/fixtureApi.js'

describe('App', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(resetApi)

  test('el aviso de datos simulados es permanente y las pestañas se recorren con el teclado', async () => {
    serveFixtures()
    await renderWithData(<App />)

    expect(screen.getByText('Usuarios y eventos SIMULADOS:')).toBeTruthy()
    const summaryTab = screen.getByRole('tab', { name: 'Resumen' })
    expect(summaryTab.getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(summaryTab, { key: 'ArrowRight' })
    const opportunitiesTab = screen.getByRole('tab', { name: 'Oportunidades' })
    expect(opportunitiesTab.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(opportunitiesTab)
    expect(screen.getByRole('tabpanel').id).toBe('panel-oportunidades')
    expect(window.location.search).toContain('vista=oportunidades')

    fireEvent.keyDown(opportunitiesTab, { key: 'End' })
    expect(screen.getByRole('tab', { name: 'Uso del MVP' }).getAttribute('aria-selected')).toBe('true')
    await act(async () => fireEvent.keyDown(screen.getByRole('tab', { name: 'Uso del MVP' }), { key: 'ArrowLeft' }))
    expect(screen.getByRole('tab', { name: 'Catálogo (real)' }).getAttribute('aria-selected')).toBe('true')
    expect(await screen.findByText('Salud del catálogo')).toBeTruthy()
    expect(screen.getByText('Usuarios y eventos SIMULADOS:')).toBeTruthy()
  })

  test('el pie avisa que es una demo no oficial y enlaza la presentación bajo la base del sitio', async () => {
    serveFixtures()
    await renderWithData(<App />)

    expect(screen.getByText('Demo no oficial · prototipo independiente, no afiliado a Rappi.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Presentación de la propuesta' }).getAttribute('href')).toBe(
      `${import.meta.env.BASE_URL}presentacion.html`,
    )
  })

  test('solo la pestaña activa tiene aria-controls (los demás paneles no existen en el DOM)', async () => {
    serveFixtures()
    await renderWithData(<App />)

    const controls = screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-controls'))
    expect(controls.filter(Boolean)).toEqual(['panel-resumen'])
    expect(document.getElementById('panel-resumen')).toBe(screen.getByRole('tabpanel'))
  })

  test('un estado vacío es texto estático: no se anuncia como región viva', async () => {
    window.history.replaceState(null, '', '/?vista=mvp&fuente=simulados')
    serveFixtures()
    await renderWithData(<App />)

    const empty = (await screen.findByText('Los datos simulados no incluyen el juego')).closest('.state')
    expect(empty.getAttribute('role')).toBeNull()
  })

  test('cambiar a Prototipo cambia el aviso y la URL', async () => {
    serveFixtures()
    await renderWithData(<App />)

    await act(async () => fireEvent.click(screen.getByRole('radio', { name: 'Prototipo' })))

    expect(screen.getByText('Usuarios y eventos del PROTOTIPO:')).toBeTruthy()
    expect(window.location.search).toContain('fuente=prototipo')
    expect(await screen.findByText('Sin señales suficientes')).toBeTruthy()
  })

  test('«Actualizar» trae lo nuevo del prototipo sin recargar la página', async () => {
    window.history.replaceState(null, '', '/?vista=verticales&fuente=prototipo')
    serveFixtures()
    await renderWithData(<App />)
    expect(await screen.findByText('Sin sugerencias que evaluar')).toBeTruthy()

    // Mientras tanto se hace la demo en el prototipo: la API ya cuenta la sugerencia mostrada.
    const fixtures = globalThis.fetch
    const demo = [{ concepto: '🥤 Bebidas gaseosas', vertical: 'licores', mostradas: 2, aceptadas: 1, ignoradas: 0, convertidas: 1, aceptacion_pct: null }]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) =>
        url.includes('/analytics/suggestions')
          ? { ok: true, status: 200, json: async () => ({ source: 'prototype', data: demo }) }
          : fixtures(url),
      ),
    )
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Actualizar' })))

    expect(await screen.findByText('sugerencias cruzadas mostradas')).toBeTruthy()
    expect(screen.queryByText('Sin sugerencias que evaluar')).toBeNull()
  })

  test('con la API caída usa los datos guardados y lo avisa', async () => {
    apiDown()
    await renderWithData(<App />)

    expect(await screen.findByText('Modo sin conexión (datos guardados):')).toBeTruthy()
    expect(await screen.findByText('3 decisiones que salen de los datos')).toBeTruthy()
  })
})
