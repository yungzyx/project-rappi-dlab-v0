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
  viajes: 'travel',
}

/** Las verticales del pasaporte, en su orden: las 8 del catálogo (las del mapa multivertical) y Viajes, que no tiene catálogo. */
export const PASSPORT_ORDER = [
  'supermercado',
  'conveniencia',
  'turbo',
  'licores',
  'chocolateria',
  'restaurantes',
  'farmacia',
  'mall',
  'viajes',
]
export const LABELS = {
  supermercado: 'Súper',
  conveniencia: 'Express',
  turbo: 'Turbo',
  licores: 'Licores',
  chocolateria: 'Chocolatería',
  restaurantes: 'Restaurantes',
  farmacia: 'Farmacia',
  mall: 'Rappi Mall',
  viajes: 'Viajes',
}

export const SCREEN_TO_GAME = Object.fromEntries(Object.entries(GAME_TO_SCREEN).map(([game, screen]) => [screen, game]))

/**
 * Se pueden jugar, pero ni el agente ni el seguimiento las proponen: la salud no se empuja (docs/diseno-ia.md §4, regla 6)
 * y Licores es solo para mayores de 18.
 */
export const NEVER_PUSHED = new Set(['farmacia', 'licores'])

/** Sellos que dan el premio de la demo (envío gratis). */
export const PASSPORT_GOAL = 4

/** Lo que una persona típica ya usa: parte sellado. */
export const STARTER = ['restaurantes', 'supermercado']
