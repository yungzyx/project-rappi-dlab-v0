# Juego de verticales

Prototipo de prueba, independiente y no afiliado a Rappi: un juego para celular que enseña las 8 verticales de Rappi Chile con misiones, sellos por vertical y cartas «¿Sabías que…?». Los datos salen del mapa multivertical del proyecto `rappi-dlab` (catálogo público del 05-10-2026). No reemplaza a los otros prototipos: es un testeo aparte.

## Cómo se juega

- **Inicio**: tu nivel de explorador, la racha y la misión del día (descubrir 2 conceptos, acertar 1 desafío, abrir 1 carta; +50 XP). Una vertical destacada por día, la misma para todos.
- **Vertical**: su sello y nivel (Explorador, Conocedor, Experto), sus conceptos por descubrir y el botón «Desafío».
- **Ficha de concepto**: en cuántas verticales está, con qué combina y qué lo reemplaza (el grafo de conceptos del proyecto).
- **Desafíos** de 4 opciones: lo típico de la vertical, arma el combo, qué lo reemplaza, la pareja imposible, el producto puente y trivia. Errar también enseña: muestra la regla real.
- **Mapa con niebla**: cada concepto se enciende al descubrirlo, junto a la vertical donde es más típico.
- **Pasaporte**: los 8 sellos y el sello especial «Conoce Rappi» (las 8 en Conocedor).
- **Álbum**: las cartas «¿Sabías que…?» que vas desbloqueando con cada desafío.

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
- Pantallas (`src/screens/`): descubrir, acertar y errar, subir de sello, mapa, pasaporte, álbum y reinicio.

Diseño: [docs/especificacion.md](docs/especificacion.md) · plan: [docs/plan-implementacion.md](docs/plan-implementacion.md).
