# Pruebas como usuario del chat

El chat de Bigotes falla sobre todo con frases que nadie escribió en la evaluación: chilenismos («un completo», «copete»,
«pa»), faltas («serbesa», «nesecito shampu»), preguntas sobre la app («hacen delivery?»), estados de ánimo («estoy
triste») o encargos («que me compren algo en una ferretería»). Este proceso las encuentra y las deja como regresión.

## Una ronda

1. Con la API arriba (`make serve` en `rappi-ia/`), escribe 40 a 60 frases como las escribiría alguien real, en
   `rappi-ia/src/rappi_ia/eval/frases_usuarios/rondaN.txt`: perfiles distintos (mamá apurada, carrete, adulto mayor,
   estudiante, fitness), mayúsculas, faltas, frases largas y combinaciones. `frase|vertical` la manda desde esa vertical;
   `+ frase` sigue la conversación (manda el pedido anterior, como el prototipo: «cerveza» y luego «+ más barata»).
2. `make probar-chat FRASES=src/rappi_ia/eval/frases_usuarios/rondaN.txt` y lee cada respuesta buscando:
   productos que no tienen que ver, una vertical rara, un aviso que sobra (+18 en un cumpleaños infantil), «Lo anoté»
   para algo que sí existe, o una pregunta sobre la app tratada como búsqueda.
3. Agrupa los fallos por causa (palabra que falta, ocasión, intención) y arréglalos donde corresponde: palabras y
   ocasiones en `concepts/taxonomy.toml` (`query_keywords` si la palabra solo sirve para pedir y no para clasificar
   productos, como «completo»), intenciones en `agent/understand.py`.
4. Cada fallo queda como test en `rappi-ia/tests/unit/test_user_phrases.py` (o en `test_bigotes.py` si necesita la
   base), escrito antes del arreglo.
5. Repite la ronda completa (`make probar-chat` sin archivo corre todas) para ver que no se rompió lo anterior.

## Rondas hechas

| Ronda | Fecha | Frases | Qué se arregló |
|---|---|---|---|
| 1 | 04-10-2026 | 55 | chilenismos y faltas, cumpleaños sin alcohol, antojo dulce, panorama en casa, preguntas sobre la app, «barato» |
| 2 | 04-10-2026 | 50 | «pa»/«pal», «sin X», «qué me recomiendas», un mimo («estoy triste»), regalo para un niño, leches vegetales |
| 3 | 04-10-2026 | 46 | «nesecito», cadenas de restaurantes, «café en grano», «pollo con papas fritas», partido, cena romántica |
| 4 | 04-10-2026 | 23 (10 conversaciones) | seguimientos: «talla g», «más barata», «de otra marca», «y en el súper?», «sin lactosa», «con papas»; si nada es del concepto nombrado, se busca por su nombre («algo más sano», «tofu», «comida china») |
| 5 | 04-10-2026 | 42 (3 conversaciones) | voz con muletillas («eh quiero este una coca po»), emojis («🍕», «quiero un 🍔»), «beer», «pastillas para dormir», «cerveza de 2 lucas», fuera de tema («el clima», «eres tonto»: se contesta y no cuenta como demanda), horario y lugar («farmacia de turno»), «y de vainilla?» tras «de chocolate» reemplaza en vez de sumar |
| 6 | 04-10-2026 | 44 (3 conversaciones) | reclamos de un pedido («mi pedido no llega», «cancelar»: a Mis pedidos, sin anotar demanda), negaciones («no quiero pizza», «cualquier cosa menos sushi»), «algo sin carne», «para mi papá» no son papas, juguete para mascota, «amburgesa», «pisa familiar», Fiestas Patrias como ocasión, seguimientos con relleno («mejor no, algo más barato») y «uno más caro» |

Límite conocido: la muestra pública del catálogo no tiene algunas cosas (jarabes para la tos, tofu, bolsas de basura).
Ahí Bigotes lo dice o muestra lo más cercano; no se arregla con palabras.
