// Se corre antes de cada archivo de pruebas: las tarjetas del juego ya cargadas (en la app las trae la API al montar
// GameProvider; varias pruebas leen `cardsOf(...)` al definirse) y el servidor del juego simulado limpio en cada prueba.
import { afterEach } from 'vitest'
import { gameCards, resetGameServer } from '../api/testing'
import { setKnowledge } from '../game/knowledge.js'

setKnowledge(gameCards())
afterEach(resetGameServer)
