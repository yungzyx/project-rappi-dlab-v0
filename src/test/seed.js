import { initialState } from '../game/progress.js'
import { KEY } from '../game/storage.js'

/** Progreso guardado para una prueba: por defecto con la bienvenida ya vista, para ir directo a lo que se prueba. */
export function seed(patch = {}) {
  localStorage.setItem(KEY, JSON.stringify({ ...initialState(), seenIntro: true, ...patch }))
}

export const stored = () => JSON.parse(localStorage.getItem(KEY))
