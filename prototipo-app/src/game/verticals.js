// El pasaporte del prototipo es el del juego: una tabla traduce los ids del juego (los del mapa multivertical) a las
// pantallas del prototipo.
export const GAME_TO_SCREEN = {
  supermercado: 'grocery',
  conveniencia: 'express',
  turbo: 'turbo',
  licores: 'liquor',
  chocolateria: 'chocolates',
  restaurantes: 'restaurants',
  farmacia: 'pharmacy',
  mall: 'retail',
}

export const SCREEN_TO_GAME = Object.fromEntries(Object.entries(GAME_TO_SCREEN).map(([game, screen]) => [screen, game]))

/** Se puede jugar, pero ni Bigotes ni el seguimiento la proponen: la salud no se empuja (docs/diseno-ia.md §4, regla 6). */
export const NEVER_PUSHED = new Set(['farmacia'])

/** Sellos que dan el premio de la demo (envío gratis). */
export const PASSPORT_GOAL = 4

/** Lo que una persona típica ya usa: parte sellado. */
export const STARTER = ['restaurantes', 'supermercado']
