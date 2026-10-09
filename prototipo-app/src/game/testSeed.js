import { initialState } from './progress.js'
import { KEY } from './storage.js'

/**
 * Progreso guardado para una prueba: por defecto con la bienvenida ya vista y sin verticales visitadas (las pruebas
 * del juego parten de un pasaporte en blanco; el arranque con Restaurantes y Súper se prueba en passport.test.js).
 */
export function seed(patch = {}) {
  localStorage.setItem(KEY, JSON.stringify({ ...initialState(), seenIntro: true, visited: [], ...patch }))
}

export const stored = () => JSON.parse(localStorage.getItem(KEY))
