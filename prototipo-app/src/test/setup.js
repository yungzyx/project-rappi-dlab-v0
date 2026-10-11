// Se corre antes de cada archivo de pruebas: las tarjetas del juego ya cargadas (en la app las trae la API al montar
// GameProvider; varias pruebas leen `cardsOf(...)` al definirse) y el servidor del juego simulado limpio en cada prueba.
import { afterEach, vi } from 'vitest'
import { gameCards, resetGameServer } from '../api/testing'
import { setKnowledge } from '../game/knowledge.js'

setKnowledge(gameCards())
afterEach(resetGameServer)

// «Borrar mis datos» recarga la página: en las pruebas es un doble que se puede revisar (`reloadToHome` importado de la app).
vi.mock('../state/reloadApp.js', () => ({ reloadToHome: vi.fn() }))
