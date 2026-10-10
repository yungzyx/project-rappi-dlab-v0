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
    expect(screen.getByText('make mvp').tagName).toBe('CODE')
    expect(screen.getByText('make mvp').parentElement.textContent).toBe(
      'Levanta el MVP con make mvp en la carpeta del proyecto y vuelve a intentar.',
    )
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
    expect(screen.queryByText('La app')).toBeNull()
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
})
