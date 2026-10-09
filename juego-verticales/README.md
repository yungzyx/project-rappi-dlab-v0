# Juego de verticales

Prototipo de prueba, independiente y no afiliado a Rappi: un juego para celular que enseña las 8 verticales de Rappi Chile con misiones, sellos por vertical y cartas «¿Sabías que…?». Los datos salen del mapa multivertical del proyecto `rappi-dlab` (catálogo público del 05-10-2026). No reemplaza a los otros prototipos: es un testeo aparte.

## Cómo se juega

- **Jugar**: un camino con las 8 verticales. Bigotes marca dónde seguir. Arriba, la barra de juego (nivel, racha, cartas) y el cofre de la misión del día (2 conceptos, 1 acierto, 1 carta: +50 XP).
- **Una ronda** son 5 pasos: dar vuelta conceptos nuevos y responder desafíos de 4 opciones, con la respuesta al instante (también enseña al errar). Al final: estrellas, XP, sello nuevo si subes de nivel y una carta para abrir. Una ronda alcanza para la misión del día.
- **Desafíos**: lo típico de la vertical, arma el combo, qué ofrece Bigotes si falta algo, la pareja imposible, dónde no está un producto y trivia.
- **Pasaporte**: el mapa con niebla (cada concepto se enciende al descubrirlo), el sello especial «Conoce Rappi» y los 8 sellos (Explorador, Conocedor, Experto); cada sello abre la colección de conceptos de su vertical.
- **Álbum**: las cartas «¿Sabías que…?» que vas ganando.

| Acción | XP |
|---|---|
| Descubrir un concepto en una vertical | +10 |
| Desafío acertado / errado | +20 / +5 |
| Misión del día completa | +50 |

## Datos

- `npm run datos -- "<ruta al 04 Mapa multivertical.html>"` lee los datos del mapa y escribe `src/data/verticales.json`.
- Al extraer se descartan los conceptos sensibles (tabaco, salud sexual, medicamentos) y los productos con esos nombres: el repo no los contiene.
- Solo agregados que ya trae el mapa: conteos por concepto y vertical, relaciones del grafo, productos y cadenas presentes en más verticales. Sin precios, tiendas ni filas de productos.
- Ningún número del juego se escribe a mano: cartas y desafíos se arman con plantillas sobre esos datos.
- El progreso del jugador se guarda solo en el navegador (`localStorage`); «Ajustes → Reiniciar progreso» lo borra.

## Uso

```bash
npm install
npm run dev     # http://localhost:5176/juego-verticales.html
npm test
npm run lint
npm run build   # dist/juego-verticales.html, un solo archivo que abre sin internet
```

## Pruebas

- Lógica (`src/game/`): cada desafío posible se comprueba contra los datos crudos (1 respuesta verdadera, 3 falsas, sin repetir); cada número de las cartas se recalcula; niveles, XP y racha (cambio de mes y de año, fecha local); progreso guardado roto o sin almacenamiento.
- Pantallas (`src/screens/`): camino, ronda (descubrir, acertar, errar, salir a mitad), fin de ronda (estrellas, carta, sello, misión), pasaporte con mapa, álbum y reinicio.

Diseño: [docs/especificacion.md](docs/especificacion.md). El plan original ([docs/plan-implementacion.md](docs/plan-implementacion.md)) es anterior al rediseño del 09-10 y queda como histórico.
