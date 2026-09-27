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
    expect(screen.getByRole('tab', { name: 'Catálogo (real)' }).getAttribute('aria-selected')).toBe('true')
    expect(await screen.findByText('Salud del catálogo')).toBeTruthy()
    expect(screen.getByText('Usuarios y eventos SIMULADOS:')).toBeTruthy()
  })

  test('cambiar a Prototipo cambia el aviso y la URL', async () => {
    serveFixtures()
    await renderWithData(<App />)

    await act(async () => fireEvent.click(screen.getByRole('radio', { name: 'Prototipo' })))

    expect(screen.getByText('Usuarios y eventos del PROTOTIPO:')).toBeTruthy()
    expect(window.location.search).toContain('fuente=prototipo')
    expect(await screen.findByText('Sin señales suficientes')).toBeTruthy()
  })

  test('con la API caída usa los datos guardados y lo avisa', async () => {
    apiDown()
    await renderWithData(<App />)

    expect(await screen.findByText('Modo sin conexión (datos guardados):')).toBeTruthy()
    expect(await screen.findByText('3 decisiones que salen de los datos')).toBeTruthy()
  })
})
