# La capa de datos para otras herramientas

La base guarda lo que Rappi publica. Esta capa le suma **significado**: qué es cada producto, de qué marca, cuánto trae, qué atributos tiene, con qué se relaciona y qué tipo de persona lo compra. Está pensada para que la búsqueda, las recomendaciones, el panel y cualquier herramienta futura lean lo mismo sin repetir el trabajo.

Todo lo que ve una herramienta externa vive en el esquema **`capa`**: vistas con nombres y columnas estables, comentadas en español. Las tablas internas pueden cambiar; las vistas no.

## Qué contiene

| Pieza | Qué responde | Dónde se define |
|---|---|---|
| **Medidas** | «¿Cuánto trae?»: cantidad, unidad base (g, ml, und), pack y total; marca las medidas que parecen un error de Rappi | `rappi_ia/layers/measures.py` |
| **Atributos** | «¿Qué es?»: 83 atributos en 9 familias (sin gluten, vegano, familiar, premium, para perro…) con fuente y confianza | `concepts/attributes.toml` |
| **Marcas y producto canónico** | «¿De qué marca?» y «¿es el mismo producto en otra tienda o vertical?» | `concepts/brands.toml`, `layers/brands.py`, `layers/canonical.py` |
| **Grafo de conocimiento** | «¿Con qué se relaciona?»: complementa, sustituye, es de la ocasión, se vende en, tiene el atributo, marca de, sinónimo… | `concepts/relations.toml`, `layers/graph.py` |
| **Segmentos de usuario** | «¿Qué tipo de persona es?»: 144 segmentos por comportamiento en 12 familias, con puntaje, nivel y evidencia | `concepts/segments.toml`, `layers/segments.py` |

Los conceptos (la taxonomía propia de 113 tipos de producto en 20 grupos) vienen de la capa de IA y son el eje que une todo.

## Vistas de `capa`

| Vista | Una fila es… | Para qué sirve |
|---|---|---|
| `capa.items` | un ítem (producto o plato) en una vertical | Punto de entrada: nombre, concepto, marca, canónico, medida y precio |
| `capa.item_attributes` | un atributo de un ítem | Filtrar por «sin gluten», «vegano», «familiar»… con fuente y evidencia |
| `capa.item_unit_prices` | el precio por kilo, litro o unidad de un ítem | Comparar precios de verdad (un sobre de 15 g es barato en la góndola y caro por gramo) |
| `capa.unit_price_ratios` | un ítem frente a la mediana de su concepto | Detectar precios mal cargados |
| `capa.item_brands` | la marca de un ítem | Marcas unidas («Coca-Cola» = «COCA COLA») y marcas propias de tienda |
| `capa.canonical_products` | un producto canónico | El mismo producto con distintos ids de Rappi o en varias verticales |
| `capa.knowledge_edges` | una arista del grafo | Relaciones entre conceptos, atributos, marcas, verticales y segmentos (sin lo aprendido de datos simulados) |
| `capa.segment_defs` | un segmento | Su definición y su regla |
| `capa.user_segments` | un segmento de una persona | A qué segmentos pertenece cada persona (sin los sensibles) |
| `capa.segment_sizes` | un segmento, semana y nivel | Cuántas personas hay en cada segmento (los sensibles solo con 5 o más) |
| `capa.layer_runs` | una corrida de una capa | De dónde viene cada dato: qué reglas, cuándo y cuántas filas |

Cada vista y cada columna tienen comentario: `\d+ capa.items` en `psql` los muestra.

### Ejemplos

Los diez productos sin gluten más baratos por kilo en supermercado:

```sql
SELECT i.name, i.brand_name, p.price_per_kg
FROM capa.items i
JOIN capa.item_attributes a USING (entity_type, entity_id)
JOIN capa.item_unit_prices p USING (entity_type, entity_id, vertical)
WHERE a.attribute_id = 'sin-gluten' AND i.vertical = 'supermercado' AND p.price_per_kg IS NOT NULL
ORDER BY p.price_per_kg LIMIT 10;
```

En qué verticales se vende un concepto y qué lo sustituye:

```sql
SELECT relation, to_kind, to_id, round(weight::numeric, 2) AS peso
FROM capa.knowledge_edges
WHERE from_kind = 'concept' AND from_id = 'cafe' AND relation IN ('se_vende_en', 'sustituye', 'complementa')
ORDER BY relation, weight DESC;
```

Cuántas personas simuladas tiene cada segmento de comida en la última foto semanal (los datos de `synthetic` son simulados):

```sql
SELECT segment_name, level, users
FROM capa.segment_sizes
WHERE family = 'comida' AND source = 'synthetic' AND week = (SELECT max(week) FROM capa.segment_sizes)
ORDER BY users DESC LIMIT 10;
```

## Cómo se arma

`make layers` en `rappi-ia/` corre las capas en este orden (unos 70 segundos con el catálogo completo). `make post-refresh` lo incluye después de cada descarga semanal, junto con conceptos, embeddings, evaluación y datos simulados:

1. `measures`: tamaño, unidad y pack de cada ítem.
2. `brands`: marca canónica de cada ítem.
3. `canonical`: el mismo producto entre ids y verticales.
4. `attributes`: atributos (usan medidas y marcas).
5. `relations`: grafo de conocimiento.
6. `segments`: segmentos de cada persona, una vez por fuente (`synthetic` y `prototype`), con la foto semanal.

Cada paso corre en una transacción, es **idempotente** (correrlo dos veces deja lo mismo) y deja una fila en `layer_runs` (solo las corridas que terminan: una que falla se deshace con su transacción) con la versión de las reglas (la fecha más una huella de su contenido: dos corridas con la misma huella usaron exactamente las mismas reglas). `make layer-report` genera `data/eval/capas.md`: cobertura por atributo y vertical, fuentes, medidas dudosas, marcas, canónicos, distribución de segmentos y una muestra de 20 ítems por atributo para revisar a ojo.

## Datos simulados y datos reales

- Los productos, precios, atributos, marcas y el grafo del catálogo son **reales** (de rappi.cl).
- Las personas y sus eventos son **simulados** (`source = 'synthetic'`) o del prototipo (`'prototype'`). Los simulados muestran la mecánica, no evidencia: las vistas de `capa` marcan la fuente y `capa.knowledge_edges` oculta lo aprendido de ellos. Nunca se mezclan fuentes en un mismo cálculo.

## Privacidad

- Los segmentos que tocan salud o vida privada (sin gluten, sin lactosa, sin azúcar, bajo sodio, sin frutos secos, bebé, embarazo, adulto mayor, salud sexual, farmacia, uso continuo, tabaco y vapeo) están marcados `sensitive` y se **nombran por lo que la persona compra**, nunca por una condición («compra sin gluten», no «celíaco»).
- `capa.user_segments` no trae filas de segmentos sensibles, y la evidencia de un segmento común no nombra lo que mira uno sensible (si «cazaofertas» listara los pañales comprados, sería el mismo dato por otra puerta). `capa.segment_sizes` muestra un segmento sensible una sola vez, sin separar por nivel, y solo si tiene 5 o más personas y el resto de su fuente también son 5 o más (con 9 personas del prototipo, ninguno aparece). Las filas por persona de los sensibles quedan en la tabla interna; hoy ninguna otra pieza las lee.
- Esto es una **convención de la capa, no una frontera de seguridad**: no hay un rol de solo lectura, y quien tenga las credenciales de la base lee también las tablas internas.
- Los segmentos sensibles no generan aristas `afin_a` ni se usan para sugerir.
- «Olvidar» borra a la persona (y con ella sus segmentos e historia); olvidar un concepto recalcula sus segmentos sin él.
- Una sola persona no crea una relación en el grafo: `co_busqueda` exige sesiones de 5 o más personas distintas.

## Calidad medida

La cobertura dice cuánto se etiquetó, no si está bien. `rappi-ia layer-sample [--seed N]` arma una muestra fija de lo que la capa afirma: 10 ítems por atributo y regla, 3 por atributo declarado por Rappi, 140 marcas y 440 conceptos repartidos por método. En git van solo los ids y las afirmaciones (`rappi-ia/src/rappi_ia/eval/capas-muestra*.json`, con sus juicios en `capas-juicios*.json`); los nombres y descripciones para juzgar quedan en `rappi-ia/data/eval/`, fuera de git. `rappi-ia layer-precision [--seed N]` calcula la precisión por regla con el mínimo que se puede asegurar (límite de Wilson al 95 %), la cifra si los «dudoso» fueran errores, y lista las reglas bajo 80 %.

Se midió dos veces con jueces de modelos de lenguaje (10 agentes independientes por muestra): con las reglas originales (semilla 7) y, después de corregirlas, con una muestra nueva de otros ítems (semilla 11), para no medir con los mismos casos que guiaron los cambios.

| Qué | Antes | Después, muestra nueva | Después, si los dudosos fueran errores |
|---|---|---|---|
| Conceptos por regla de nombre | 81 % | 86 % | 83 % |
| Conceptos por mapeo de categoría, sección o cocina | 82 % | 88 % | 85 % |
| Conceptos por vecinos (embeddings) | 57 % | 88 % | 84 % |
| Atributos por reglas propias | 92 % | 92 % | 86 % |
| Atributos declarados por Rappi | 86 % | 86 % | 67 % |
| Marcas deducidas del nombre / declaradas | 99 % / 97 % | 98 % / 97 % | 97 % / 95 % |

Las correcciones: los vecinos solo deciden con 80 % de acuerdo; la cocina del local cuenta solo con un mapeo muy confiable («Asiática» ya no es sushi y «Combos» no dice el plato); la proteína del nombre de un plato le gana a una sección genérica; un ingrediente en el nombre de un plato («Macarrón Frutilla») no lo vuelve fruta; una sección sin mapeo que nombra un plato («Empanadas de Horno») sí da concepto; y se acotaron reglas de atributos que calzaban fuera de su ámbito. Los atributos no mejoraron fuera de muestra: esas correcciones atacaron errores puntuales. El costo: los restaurantes con concepto bajaron de 98,2 % a 94,7 %. Los agregados siguen el diseño de la muestra (prioriza reglas propias y platos), no la proporción de cada fuente en la base.

## Cómo agregar algo

| Quiero… | Qué hago |
|---|---|
| Un atributo nuevo | Una entrada en `attributes.toml` con sus frases (y, si sirve, el campo de Rappi que lo declara); un test con frases positivas y negativas |
| Un segmento nuevo | Una entrada en `segments.toml` combinando piezas (conceptos, atributos, palabras de consulta, horas, métricas…); el cargador valida que todo exista. Ver la cabecera del archivo para las piezas |
| Una relación curada | Una arista en `relations.toml` (los tipos y existencia de los nodos se validan) |
| Una vista para otra herramienta | Una migración que cree la vista en `capa` con `COMMENT` en la vista y en cada columna; un test lo exige |

Cambiar las reglas basta con volver a correr `make layers`: no hay que tocar código ni la base a mano.

## Límites que conviene conocer

- Los atributos salen de lo que Rappi declara y de frases en el nombre: dicen «el nombre dice sin gluten», no que el producto lo sea. La fuente y la confianza van en cada fila.
- `capa.canonical_products.verticals` se infla con tiendas que Rappi etiqueta en dos verticales.
- `co_busqueda` sale vacía mientras no haya sesiones reales con varios conceptos (el simulador genera un concepto por sesión).
- Los umbrales de los segmentos se calibraron con datos simulados: habrá que ajustarlos cuando haya uso real.
- `capa.segment_sizes` no impide deducir a una persona comparando dos semanas (un total sensible que sube de 5 a 6 cuando se sabe que se sumó una sola persona); el umbral de 5 es el de la spec; el panel de negocio usa 20.
- `capa.layer_runs` solo guarda corridas terminadas; una que falla no deja fila.
