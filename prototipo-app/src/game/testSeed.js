import { act, waitFor } from '@testing-library/react'
import { expect, vi } from 'vitest'
import { gameServer, pendingGameLoads } from '../api/testing'
import { initialState } from './progress.js'

/**
 * Progreso que devuelve el servidor simulado para una prueba (ver `stubApi`): por defecto con la bienvenida ya vista y
 * sin verticales visitadas (las pruebas del juego parten de un pasaporte en blanco; el arranque con Restaurantes y Súper
 * se prueba en passport.test.js). Va antes de montar el juego.
 */
export function seed(patch = {}) {
  gameServer.state = { ...initialState(), seenIntro: true, visited: [], ...patch }
}

/** Lo último que la app le guardó al servidor simulado (el cuerpo del último PUT), o null si no guardó nada. */
export const stored = () => gameServer.puts.at(-1) ?? null

/** Espera a que el servidor simulado tenga ese progreso (el guardado es asíncrono y de a una petición). */
export const savedAs = (check) => waitFor(() => check(stored()))

/**
 * Espera a que el juego termine de cargar sus tarjetas y su progreso (bien o mal) y a que no quede un aviso de conexión
 * en pantalla (el de las pantallas del juego mientras cargan). Sirve con relojes de verdad y fingidos (con estos deja
 * correr lo pendiente sin avanzar el tiempo).
 */
export async function gameReady() {
  const turn = () =>
    act(async () => {
      if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0)
      else await new Promise((resolve) => setTimeout(resolve, 0))
    })
  // La carga va en dos pasos seguidos (tarjetas, luego progreso): se espera lo que haya en vuelo y se deja correr un turno.
  for (let step = 0; step < 50; step++) {
    const loads = pendingGameLoads()
    if (loads.length === 0 && step > 0) break
    if (loads.length > 0 && !vi.isFakeTimers()) await act(() => Promise.all(loads))
    await turn()
  }
  for (let step = 0; step < 50 && document.querySelector('.connection-card'); step++) await turn()
  expect(document.querySelector('.connection-card')).toBeNull()
}
