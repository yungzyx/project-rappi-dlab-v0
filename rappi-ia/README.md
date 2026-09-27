# rappi-ia

Conecta el catálogo que baja [`rappi-scraper`](../rappi-scraper/) con el asistente **Bigotes** del [prototipo](../prototipo-app/) y con el [panel para la empresa](../dashboard-empresa/). Diseño completo en [docs/diseno-ia.md](../docs/diseno-ia.md).

**Regla:** *buscar dentro del vertical, entender al usuario a través de los verticales*. La búsqueda nunca mezcla verticales. El puente entre ellos son los **conceptos**, una taxonomía propia de 112 conceptos con complementos entre sí.

| Pieza | Qué hace | Dónde |
|---|---|---|
| Conceptos (capa 2) | Cada producto y plato → un concepto, con procedencia: categoría (mapa curado por 2 agentes y un juez), reglas por palabra o vecinos cercanos (kNN) | `concepts/` |
| Embeddings | Texto con `multilingual-e5-base` (caché por contenido, HNSW por vertical); imágenes con CLIP; voz con Whisper → texto | `embeddings/`, `agent/audio.py` |
| Búsqueda híbrida | Léxico (sin tildes ni ñ, IDF) + vectorial → RRF → refuerzo por concepto, con filtros dentro de cada lista y regla de "sin resultado" | `retrieval/hybrid.py` |
| Bigotes | Entender → buscar → sugerir un complemento de otro vertical → redactar (plantillas o Claude) → verificar | `agent/` |
| Eventos y analítica | Usuarios y eventos (hoy **simulados**), métricas de frecuencia, abandono, oportunidades y afinidad | `events/`, `analytics/` |

## Instalar

```bash
cd ~/Documents/LeRepo/Rappi/rappi-ia
make install      # .venv + rappi-scraper (esquema) + API + tests
make install-ml   # modelos locales: e5, CLIP, Whisper (y Claude opcional)
make db-test      # base rappi_ia_test (los tests no tocan rappi ni rappi_test)
make migrate
```

Los modelos (~2 GB) se bajan de Hugging Face la primera vez que se usan. Para que Claude redacte las respuestas, agrega `ANTHROPIC_API_KEY` en `.env`; sin clave, Bigotes responde con plantillas y las mismas reglas.

## Correr

Después de cada `rappi refresh` del scraper:

```bash
make concepts     # capa 2 (≈1 min; con kNN si está el extra ml)
make embed        # embeddings nuevos (incremental; ~45 textos/s en un M2)
make eval         # evalúa la búsqueda y recalibra τ
make synth        # usuarios simulados para el panel (1.500 usuarios, 20 semanas, semilla 7)
```

Otros comandos:

- `rappi-ia search "algo para el carrete" --vertical licores`
- `rappi-ia analytics`
- `rappi-ia embed-images --limit 50 --forzar`: imágenes. **No** correrlo en masa mientras el scraper descarga.

## Resultados (27-09-2026, datos parciales: la descarga completa sigue en curso)

**Búsqueda.** 111 consultas en 6 verticales, en `eval/queries.json`. La relevancia se juzga por concepto.

| Modo | P@10 | MRR | nDCG@10 |
|---|---|---|---|
| Léxico | 0,728 | 0,832 | 0,736 |
| Vectorial | 0,784 | 0,868 | 0,795 |
| **Híbrido** | **0,888** | **0,957** | **0,898** |

El híbrido gana en todos los tipos de consulta:

| Tipo de consulta | nDCG@10 |
|---|---|
| Exactas | 0,97 |
| Sin tildes | 0,97 |
| Necesidades en lenguaje natural ("algo para el carrete") | 0,71, vs 0,49 del léxico |

**"Sin resultado"** (demanda no satisfecha): precisión 0,91 y recall 0,67 sobre 15 consultas negativas.
- **Regla:** es un miss cuando nada calza todas las palabras y, además, falla una de estas dos condiciones:
  - si la consulta nombra un concepto, ese concepto no tiene surtido real en el vertical;
  - si no nombra ninguno, el coseno queda bajo τ.
- **Límite conocido:** un iPhone en el súper no cuenta como miss, porque hay accesorios del mismo concepto (celulares).

**Conceptos (capa 2).** Tienen concepto el 99,6% de los productos y el 98,6% de los platos. La precisión se midió con dos jueces independientes sobre una muestra estratificada:

| Tipo de asignación | Precisión |
|---|---|
| Por categoría (el 97% de los productos) | ≈ 88% |
| Platos | ≈ 81% |
| Reglas por nombre en productos (1%) | 55%: la parte más débil |

- **kNN:** corrigió 394 ítems, pero no subió la precisión global.
- **Siguiente mejora:** etiquetar con LLM (o Jev) los ítems de baja confianza y revisar a mano los de mayor tráfico.

## Límites

- **Datos simulados:** usuarios, eventos y pedidos son **simulados** (`source = 'synthetic'`), con supuestos explícitos en `events/synth.py`. El panel muestra la mecánica, no evidencia.
- **Muestra pública:** el catálogo es la muestra pública (hasta 24 productos por sub-pasillo), así que "no está" no significa "Rappi no lo vende".
- **Uso interno:** fotos y descripciones son de Rappi y de los comercios; uso interno solamente (ver `docs/contexto-y-problema.md` §7).

## Estructura

```text
src/rappi_ia/
├── concepts/    taxonomía (taxonomy.toml), complementos, mapa de categorías (category_map.csv), reglas, kNN
├── embeddings/  e5 y CLIP, caché de texto, imágenes, índices HNSW
├── retrieval/   búsqueda híbrida por vertical
├── agent/       Bigotes: entender, herramientas, redactar, voz, foto
├── events/      eventos, perfil con decaimiento, "olvidar", generador simulado
├── analytics/   métricas del panel
├── eval/        set de evaluación y calibración de τ (thresholds.json)
└── api/         FastAPI
```

Las migraciones de la base (009 conceptos, 010 embeddings, 011 eventos) viven en `rappi-scraper/src/rappi_scraper/storage/migrations/`, para que haya un solo historial.
