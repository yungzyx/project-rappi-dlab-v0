// Juego de verticales en la API: las tarjetas de conocimiento, el progreso de cada usuario y los desafíos del catálogo.

import { request } from './client'

const enc = encodeURIComponent

/** Las tarjetas de conocimiento (datos y preguntas) de todas las verticales, cada una con los conceptos que menciona. */
export async function cards() {
  return (await request('/game/cards')).cards
}

/** El progreso guardado de este usuario, o null si el servidor aún no tiene ninguno (204). */
export async function gameState(userId) {
  return (await request(`/game/state/${enc(userId)}`))?.state ?? null
}

/** Guarda el progreso; devuelve el estado como quedó en el servidor. */
export async function saveGameState(userId, state) {
  return (await request(`/game/state/${enc(userId)}`, { method: 'PUT', body: { state } })).state
}

/**
 * Al cerrar la pestaña: el mismo PUT, con `keepalive` para que el navegador lo complete aunque la página se descargue.
 * No se espera ni se lee la respuesta; si falla, lo guardado antes en el servidor sigue ahí.
 */
export function saveGameStateOnHide(userId, state) {
  request(`/game/state/${enc(userId)}`, { method: 'PUT', body: { state }, keepalive: true }).catch(() => {})
}

/** Un desafío del catálogo para una vertical (la misma `seed` da el mismo), o null si no hay (204). */
export const challenge = (vertical, seed) =>
  request(`/game/challenge?vertical=${enc(vertical)}&seed=${enc(seed)}`)
