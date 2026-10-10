# Verificación del contenido del juego por vertical (09-10-2026)

Las 108 tarjetas de `prototipo-app/src/game/knowledge.json` (12 por vertical: 6 datos y 6 preguntas) salen de 144 candidatos investigados en la web, 16 por vertical. Cada candidato trajo su fuente y una cita corta de la página que lo respalda.

## Cómo se verificó

1. **Investigación:** una búsqueda por vertical. Cada afirmación (y cada cifra, con su año) se confirmó abriendo la página citada; lo que no se pudo confirmar no se escribió.
2. **Verificación independiente:** otros tres revisores abrieron de nuevo cada fuente y marcaron cada candidato como correcto, a corregir (con el texto corregido) o a descartar. También buscaron temas repetidos entre verticales.
3. **Selección:** se aplicaron las correcciones, se sacaron los repetidos y los datos débiles y se tomaron los primeros 6 datos y 6 preguntas de cada vertical. Tres textos se acortaron a mano para respetar el límite de 200 caracteres, sin cambiar el dato.
4. **Test:** `knowledge.test.js` valida la forma de todo el contenido (12 por vertical, largos, fuente https, 3 alternativas distintas y la respuesta en distintas posiciones).

**Resultado:** 87 entraron tal cual, 21 entraron corregidas, 12 quedaron fuera por repetidas o débiles y 24 quedan de reserva (verificadas, sin lugar). Ningún candidato fue descartado por falso.

Fuentes más usadas: en.wikipedia.org (71), es.wikipedia.org (6), ich.unesco.org (3), collection.sciencemuseumgroup.org.uk (2), kidshealth.org (2), smithsonianmag.com (2), lemelson.mit.edu (2), precolombino.cl (1). Britannica y varias páginas del Smithsonian bloquearon la lectura automática; en esos casos se usó otra fuente que se pudo abrir.

## Por vertical

| Vertical | Candidato | Tipo | Estado | Motivo o corrección |
|---|---|---|---|---|
| Súper | supermercado-c01 | dato | Entró |  |
| Súper | supermercado-c02 | dato | Entró corregida | La fuente dice que fue el primer producto con código UPC escaneado en la caja de un supermercado, no lo primero que pasó por un lector de código de barras. D… |
| Súper | supermercado-c03 | dato | Entró |  |
| Súper | supermercado-c04 | dato | Entró |  |
| Súper | supermercado-c05 | dato | Entró corregida | Un solo árbol, cartero y 1926: todo comprobado. El 80% de Wikipedia corresponde a «comienzos del siglo XXI», no a «hoy». (Tema cercano a turbo-c04 sobre la p… |
| Súper | supermercado-c06 | dato | Entró corregida | La fuente dice las dos cosas, pero lo de «España y Chile, los dos mayores productores» no tiene fecha y no se sostiene: otras fuentes ponen a España primera … |
| Súper | supermercado-c07 | dato | Reserva | sobraba (6 por tipo) |
| Súper | supermercado-c08 | dato | Reserva | sobraba (6 por tipo) |
| Súper | supermercado-c09 | pregunta | Fuera | repite el ramen instantáneo (queda en Express) |
| Súper | supermercado-c10 | pregunta | Entró |  |
| Súper | supermercado-c11 | pregunta | Entró corregida | Wikipedia dice que las zanahorias «orientales» que sobreviven son moradas o amarillas. Pero la opción «Blancas» no es claramente incorrecta: la zanahoria sil… |
| Súper | supermercado-c12 | pregunta | Entró |  |
| Súper | supermercado-c13 | pregunta | Entró |  |
| Súper | supermercado-c14 | pregunta | Entró |  |
| Súper | supermercado-c15 | pregunta | Fuera | la cifra del pan viene de un gremio, no de una estadística oficial |
| Súper | supermercado-c16 | pregunta | Entró |  |
| Express | conveniencia-c01 | dato | Entró |  |
| Express | conveniencia-c02 | dato | Fuera | repite el plástico de burbujas (queda en Rappi Mall) |
| Express | conveniencia-c03 | dato | Entró corregida | La fuente dice que los primeros abrelatas no se patentaron sino hasta 1855, no que «aparecieran» ese año. Lo del martillo y cincel está respaldado (instrucci… |
| Express | conveniencia-c04 | dato | Entró |  |
| Express | conveniencia-c05 | dato | Entró |  |
| Express | conveniencia-c06 | dato | Entró corregida | La IDFA lo cuenta como relato, pero es solo uno de varios orígenes que se disputan el cono: la misma fuente atribuye el primer cono a Italo Marchiony (1896, … |
| Express | conveniencia-c07 | dato | Entró corregida | La fuente (NCA, una asociación del sector) dice «más de 300 cafés a mediados del siglo XVII», pero otras fuentes registran unos 82 en la City de Londres en 1… |
| Express | conveniencia-c08 | dato | Reserva | sobraba (6 por tipo) |
| Express | conveniencia-c09 | pregunta | Entró |  |
| Express | conveniencia-c10 | pregunta | Entró |  |
| Express | conveniencia-c11 | pregunta | Entró |  |
| Express | conveniencia-c12 | pregunta | Entró |  |
| Express | conveniencia-c13 | pregunta | Entró corregida | Wikipedia respalda los hechos: Santa Anna se la dio a Thomas Adams como sustituto del caucho; tiras; Adams New York Chewing Gum en 1871. Hay que corregir la … |
| Express | conveniencia-c14 | pregunta | Entró |  |
| Express | conveniencia-c15 | pregunta | Reserva | sobraba (6 por tipo) |
| Express | conveniencia-c16 | pregunta | Reserva | sobraba (6 por tipo) |
| Turbo | turbo-c01 | dato | Entró |  |
| Turbo | turbo-c02 | dato | Entró corregida | Wikipedia dice que hoy «suelen» ser eléctricos a batería, sin referirse solo al Reino Unido (fueron comunes en varios países europeos, sobre todo allí); «cas… |
| Turbo | turbo-c03 | dato | Entró |  |
| Turbo | turbo-c04 | dato | Entró |  |
| Turbo | turbo-c05 | dato | Entró |  |
| Turbo | turbo-c06 | dato | Entró |  |
| Turbo | turbo-c07 | dato | Reserva | sobraba (6 por tipo) |
| Turbo | turbo-c08 | dato | Reserva | sobraba (6 por tipo) |
| Turbo | turbo-c09 | pregunta | Entró |  |
| Turbo | turbo-c10 | pregunta | Entró corregida | La FDA respalda los 4 °C y los −18 °C. La regla de 2 horas se refiere a temperatura ambiente, y baja a 1 hora con calor. «Fuera del frío» es impreciso, y es … |
| Turbo | turbo-c11 | pregunta | Entró |  |
| Turbo | turbo-c12 | pregunta | Entró |  |
| Turbo | turbo-c13 | pregunta | Entró corregida | Wikipedia respalda el 15-09-1975, 7 líneas, 143 estaciones y 2,03 millones por día hábil (2023). Pero «hoy» va a quedar desactualizado cuando abra la Línea 7… |
| Turbo | turbo-c14 | pregunta | Entró |  |
| Turbo | turbo-c15 | pregunta | Fuera | repite la frutilla (queda en Súper) |
| Turbo | turbo-c16 | pregunta | Reserva | sobraba (6 por tipo) |
| Licores | licores-c01 | dato | Entró |  |
| Licores | licores-c02 | dato | Entró |  |
| Licores | licores-c03 | dato | Entró |  |
| Licores | licores-c04 | dato | Entró |  |
| Licores | licores-c05 | dato | Entró corregida | Wikipedia: es falso que inventara el champán espumoso; la frase de las estrellas «apparently» apareció por primera vez en un aviso de fines del siglo XIX. Su… |
| Licores | licores-c06 | dato | Entró |  |
| Licores | licores-c07 | dato | Reserva | sobraba (6 por tipo) |
| Licores | licores-c08 | dato | Reserva | sobraba (6 por tipo) |
| Licores | licores-c09 | pregunta | Entró |  |
| Licores | licores-c10 | pregunta | Fuera | repite la denominación del pisco (queda c11) |
| Licores | licores-c11 | pregunta | Entró |  |
| Licores | licores-c12 | pregunta | Entró corregida | Wikipedia: «some estimates» de dos tercios a nueve décimos; la mayoría de las viñas chilenas siguen libres de filoxera; aislamiento por Atacama, Andes y Pací… |
| Licores | licores-c13 | pregunta | Entró |  |
| Licores | licores-c14 | pregunta | Entró |  |
| Licores | licores-c15 | pregunta | Entró |  |
| Licores | licores-c16 | pregunta | Reserva | sobraba (6 por tipo) |
| Chocolatería | chocolateria-c01 | dato | Entró |  |
| Chocolatería | chocolateria-c02 | dato | Entró |  |
| Chocolatería | chocolateria-c03 | dato | Entró |  |
| Chocolatería | chocolateria-c04 | dato | Entró |  |
| Chocolatería | chocolateria-c05 | dato | Entró |  |
| Chocolatería | chocolateria-c06 | dato | Entró |  |
| Chocolatería | chocolateria-c07 | dato | Reserva | sobraba (6 por tipo) |
| Chocolatería | chocolateria-c08 | dato | Fuera | repite el conchado (queda la pregunta c11) |
| Chocolatería | chocolateria-c09 | pregunta | Entró |  |
| Chocolatería | chocolateria-c10 | pregunta | Entró |  |
| Chocolatería | chocolateria-c11 | pregunta | Entró |  |
| Chocolatería | chocolateria-c12 | pregunta | Entró |  |
| Chocolatería | chocolateria-c13 | pregunta | Entró |  |
| Chocolatería | chocolateria-c14 | pregunta | Entró |  |
| Chocolatería | chocolateria-c15 | pregunta | Reserva | sobraba (6 por tipo) |
| Chocolatería | chocolateria-c16 | pregunta | Reserva | sobraba (6 por tipo) |
| Restaurantes | restaurantes-c01 | dato | Entró corregida | UNESCO: inscrito en 2017; «about 3,000 Pizzaiuoli now live and perform» en Nápoles. La cifra es de la nominación de 2017: fecharla. |
| Restaurantes | restaurantes-c02 | dato | Entró |  |
| Restaurantes | restaurantes-c03 | dato | Entró |  |
| Restaurantes | restaurantes-c04 | dato | Entró |  |
| Restaurantes | restaurantes-c05 | dato | Entró corregida | es.wikipedia: hoyo de ~medio metro, piedras calentadas en fogata (no dice «al rojo vivo»), capas cubiertas con hojas de pangue o nalca, y el conjunto se tapa… |
| Restaurantes | restaurantes-c06 | dato | Entró |  |
| Restaurantes | restaurantes-c07 | dato | Reserva | sobraba (6 por tipo) |
| Restaurantes | restaurantes-c08 | dato | Reserva | sobraba (6 por tipo) |
| Restaurantes | restaurantes-c09 | pregunta | Entró |  |
| Restaurantes | restaurantes-c10 | pregunta | Entró |  |
| Restaurantes | restaurantes-c11 | pregunta | Entró |  |
| Restaurantes | restaurantes-c12 | pregunta | Entró |  |
| Restaurantes | restaurantes-c13 | pregunta | Entró |  |
| Restaurantes | restaurantes-c14 | pregunta | Entró |  |
| Restaurantes | restaurantes-c15 | pregunta | Reserva | sobraba (6 por tipo) |
| Restaurantes | restaurantes-c16 | pregunta | Reserva | sobraba (6 por tipo) |
| Farmacia | farmacia-c01 | dato | Entró corregida | El Science Museum lo afirma, pero es un dato muy repetido y con respaldo débil (las tablillas mencionan el sauce como ingrediente; lo del alivio del dolor es… |
| Farmacia | farmacia-c02 | dato | Entró |  |
| Farmacia | farmacia-c03 | dato | Entró corregida | 1422 es la primera mención (ya iba en su tercer dueño) y sigue abierta: correcto. Lo del 'jugo de momia' y polvo de erizo viene de una sección de Wikipedia s… |
| Farmacia | farmacia-c04 | dato | Entró |  |
| Farmacia | farmacia-c05 | dato | Fuera | tercer dato de huesos de la misma fuente |
| Farmacia | farmacia-c06 | dato | Entró |  |
| Farmacia | farmacia-c07 | dato | Entró |  |
| Farmacia | farmacia-c08 | dato | Reserva | sobraba (6 por tipo) |
| Farmacia | farmacia-c09 | pregunta | Entró |  |
| Farmacia | farmacia-c10 | pregunta | Fuera | repite la corteza de sauce y la aspirina (queda c01) |
| Farmacia | farmacia-c11 | pregunta | Entró |  |
| Farmacia | farmacia-c12 | pregunta | Fuera | la fecha de Bagdad (754) es más tradición que dato documentado |
| Farmacia | farmacia-c13 | pregunta | Entró |  |
| Farmacia | farmacia-c14 | pregunta | Entró |  |
| Farmacia | farmacia-c15 | pregunta | Entró |  |
| Farmacia | farmacia-c16 | pregunta | Entró |  |
| Rappi Mall | mall-c01 | dato | Entró |  |
| Rappi Mall | mall-c02 | dato | Entró |  |
| Rappi Mall | mall-c03 | dato | Fuera | repite el primer código de barras (queda en Súper) |
| Rappi Mall | mall-c04 | dato | Entró corregida | NPS confirma 1902, Mississippi, 'unsportsmanlike'. Pero el oso lo hicieron Morris y Rose Michtom, dueños de una dulcería de Brooklyn, no 'un juguetero'. Adem… |
| Rappi Mall | mall-c05 | dato | Entró |  |
| Rappi Mall | mall-c06 | dato | Entró |  |
| Rappi Mall | mall-c07 | dato | Entró |  |
| Rappi Mall | mall-c08 | dato | Reserva | sobraba (6 por tipo) |
| Rappi Mall | mall-c09 | pregunta | Entró |  |
| Rappi Mall | mall-c10 | pregunta | Entró |  |
| Rappi Mall | mall-c11 | pregunta | Entró |  |
| Rappi Mall | mall-c12 | pregunta | Entró corregida | 1923, Mason, Nashville: correcto. Pero la fuente dice 'by 1915' (hacia 1915), no 'desde 1915'; en Europa ya había envases metálicos en 1911. |
| Rappi Mall | mall-c13 | pregunta | Entró |  |
| Rappi Mall | mall-c14 | pregunta | Fuera | repite el origen de Black Friday (queda c06) |
| Rappi Mall | mall-c15 | pregunta | Entró |  |
| Rappi Mall | mall-c16 | pregunta | Reserva | sobraba (6 por tipo) |
| Viajes | viajes-c01 | dato | Entró |  |
| Viajes | viajes-c02 | dato | Entró |  |
| Viajes | viajes-c03 | dato | Entró |  |
| Viajes | viajes-c04 | dato | Entró |  |
| Viajes | viajes-c05 | dato | Entró corregida | 12 s y 36 m confirmados (Smithsonian). La comparación 'menos que el largo de un avión de pasajeros actual' es dudosa: un A220-100 mide ~35 m y un A320 ~37,6 … |
| Viajes | viajes-c06 | dato | Entró |  |
| Viajes | viajes-c07 | dato | Fuera | repite los husos horarios de Chile (queda la pregunta c15) |
| Viajes | viajes-c08 | dato | Reserva | sobraba (6 por tipo) |
| Viajes | viajes-c09 | pregunta | Entró |  |
| Viajes | viajes-c10 | pregunta | Entró |  |
| Viajes | viajes-c11 | pregunta | Entró |  |
| Viajes | viajes-c12 | pregunta | Entró |  |
| Viajes | viajes-c13 | pregunta | Entró corregida | ONU Turismo: 1.400 millones, +11 % vs 2023, pero 99 % del nivel de 2019; 'volvió a su nivel previo' exagera un poco. |
| Viajes | viajes-c14 | pregunta | Entró |  |
| Viajes | viajes-c15 | pregunta | Reserva | sobraba (6 por tipo) |
| Viajes | viajes-c16 | pregunta | Reserva | sobraba (6 por tipo) |

## A revisar más adelante

- **Viajes, vuelo más largo (viajes-01):** podría cambiar si Qantas inaugura su Sídney–Londres.
- **Viajes, Visa Waiver:** la pregunta quedó de reserva; si se usa, revisar en 2027 (Argentina busca volver al programa).
- **Metro de Santiago (turbo-11):** la respuesta (1975) no cambia, pero la explicación da cifras de 2023.
