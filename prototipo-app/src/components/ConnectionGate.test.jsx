import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { API_URL } from '../api/client'
import { fixture, stubApi } from '../api/testing'
import ConnectionGate from './ConnectionGate'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const renderGate = () =>
  render(
    <ConnectionGate>
      <p>La app</p>
    </ConnectionGate>,
  )

describe('ConnectionGate', () => {
  test('con la API arriba muestra la app', async () => {
    const api = stubApi({ '/health': fixture('health') })
    renderGate()
    expect(await screen.findByText('La app')).toBeTruthy()
    expect(screen.queryByText('Sin conexión con Mochi')).toBeNull()
    expect(api).toHaveBeenCalledTimes(1)
    expect(api.mock.calls[0][0]).toBe(`${API_URL}/health`)
  })

  test('sin API muestra «Sin conexión con Mochi» y no la app', async () => {
    stubApi({ '/health': 'offline' })
    renderGate()
    expect(await screen.findByRole('heading', { name: 'Sin conexión con Mochi' })).toBeTruthy()
    expect(screen.getByText(`No pude conectar con la API del MVP (${API_URL}).`)).toBeTruthy()
    const [help, wait] = screen.getAllByText('make mvp')
    expect(help.tagName).toBe('CODE')
    expect(help.parentElement.textContent).toBe('Levanta el MVP con make mvp en la carpeta del proyecto y vuelve a intentar.')
    expect(wait.parentElement.textContent).toBe('Si acabas de correr make mvp, espera «MVP listo».')
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
    expect(screen.queryByText('La app')).toBeNull()
  })

  test('the app-wide gate has no Salir button', async () => {
    stubApi({ '/health': 'offline' })
    renderGate()
    await screen.findByText('Sin conexión con Mochi')
    expect(screen.queryByRole('button', { name: 'Salir' })).toBeNull()
  })

  test('una API lenta muestra «Conectando con Mochi…» y después entra', async () => {
    vi.useFakeTimers()
    stubApi({ '/health': 'slow:3000' })
    renderGate()
    expect(screen.getByText('Conectando con Mochi…')).toBeTruthy()
    expect(screen.queryByText('La app')).toBeNull()

    await act(() => vi.advanceTimersByTimeAsync(3000))
    expect(screen.getByText('La app')).toBeTruthy()
    expect(screen.queryByText('Conectando con Mochi…')).toBeNull()
    expect(screen.queryByText('Sin conexión con Mochi')).toBeNull()
  })

  test('Reintentar vuelve a probar y entra cuando la API responde', async () => {
    const offline = stubApi({ '/health': 'offline' })
    renderGate()
    await screen.findByText('Sin conexión con Mochi')
    expect(offline).toHaveBeenCalledTimes(1)

    const online = stubApi({ '/health': fixture('health') })
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('La app')).toBeTruthy()
    expect(online).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Sin conexión con Mochi')).toBeNull()
  })

  test('sin conexión reintenta en silencio cada 2 s y entra solo cuando la API responde', async () => {
    vi.useFakeTimers()
    const offline = stubApi({ '/health': 'offline' })
    renderGate()
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.getByRole('heading', { name: 'Sin conexión con Mochi' })).toBeTruthy()
    const retry = screen.getByRole('button', { name: 'Reintentar' })
    expect(offline).toHaveBeenCalledTimes(1)

    await act(() => vi.advanceTimersByTimeAsync(1999))
    expect(offline).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(offline).toHaveBeenCalledTimes(2)
    // En silencio: sigue la misma pantalla y el mismo botón, sin pasar por «Conectando…».
    expect(screen.queryByText('Conectando con Mochi…')).toBeNull()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBe(retry)

    const online = stubApi({ '/health': fixture('health') })
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(online).toHaveBeenCalledTimes(1)
    expect(screen.getByText('La app')).toBeTruthy()
    expect(screen.queryByText('Sin conexión con Mochi')).toBeNull()
  })

  test('dentro de la app no sigue preguntando por la API', async () => {
    vi.useFakeTimers()
    const api = stubApi({ '/health': fixture('health') })
    renderGate()
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.getByText('La app')).toBeTruthy()

    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(api).toHaveBeenCalledTimes(1)
  })

  test('Reintentar no desmonta el botón: el foco se queda en él', async () => {
    vi.useFakeTimers()
    const api = stubApi({ '/health': 'offline' })
    renderGate()
    await act(() => vi.advanceTimersByTimeAsync(0))
    const retry = screen.getByRole('button', { name: 'Reintentar' })
    retry.focus()

    fireEvent.click(retry)
    expect(screen.queryByText('Conectando con Mochi…')).toBeNull()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBe(retry)
    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(api).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBe(retry)
    expect(document.activeElement).toBe(retry)
  })

  test('el aviso para lectores de pantalla existe siempre y solo cambia su texto', async () => {
    vi.useFakeTimers()
    stubApi({ '/health': 'offline' })
    renderGate()
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('Conectando con Mochi…')

    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.getByRole('status')).toBe(status)
    expect(status.textContent).toContain('Sin conexión con Mochi')
    expect(status.textContent).not.toContain('Conectando con Mochi…')
  })
})
