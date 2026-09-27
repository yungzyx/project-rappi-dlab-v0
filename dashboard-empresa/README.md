# Panel empresa

Panel interno para Rappi Chile que convierte la conducta de compra y lo que la gente pide en búsquedas y chat en **decisiones para subir la frecuencia y bajar el abandono**:

- tendencias de interés por concepto;
- demanda no satisfecha como oportunidad de negocio (p. ej. «mucha gente pide comida peruana y no hay»);
- usuarios en riesgo según su propio ritmo de compra;
- rendimiento de las sugerencias cruzadas de Bigotes entre verticales;
- salud real del catálogo.

Las definiciones de cada métrica y la redacción vienen de [docs/diseno-ia.md §5](../docs/diseno-ia.md#5-panel-para-la-empresa-vale-la-pena). Los datos salen de la API de [`rappi-ia`](../rappi-ia/).

> **Usuarios y eventos SIMULADOS.** Hoy los usuarios, eventos y pedidos son simulados (`source=synthetic`, generados con semilla y supuestos explícitos en `rappi-ia/src/rappi_ia/events/synth.py`). El panel **muestra la mecánica, no evidencia**. Por ejemplo, el simulador asume que quien usa más verticales se va menos, así que esa relación aparece por construcción. El catálogo sí es real: es la muestra pública de rappi.cl.

El panel lo dice siempre:

- un aviso fijo arriba que nunca se oculta;
- una insignia de procedencia en cada bloque («Simulado», «Prototipo», «Real · rappi.cl» o «Demanda simulada»).

Las fuentes nunca se mezclan: cada respuesta se valida contra la fuente pedida.

## Cómo correrlo

1. Levantar la API de `rappi-ia`. El panel la busca por defecto en `http://localhost:8000`:

   ```bash
   cd ../rappi-ia
   make serve
   ```

2. Levantar el panel:

   ```bash
   cd ../dashboard-empresa
   npm install
   npm run dev          # http://localhost:5175
   ```

La URL de la API se cambia con `VITE_API_URL`, por ejemplo `VITE_API_URL=http://localhost:8001 npm run dev`. La API ya acepta pedidos desde `localhost:51xx` (CORS).

**Sin la API** el panel igual funciona. Cada consulta que falla, o que tarda más de 30 s, cae a la respuesta guardada en `src/fixtures/`. En ese caso aparece el aviso «Modo sin conexión (datos guardados)», que dice qué consultas fallaron y por qué, y trae un botón *Reintentar*.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en el puerto 5175 |
| `npm test` | Tests (Vitest + Testing Library, sin red: usan `src/fixtures/`) |
| `npm run lint` | ESLint (reglas de React Hooks 7) |
| `npm run build` | Build de producción en `dist/` |
| `npm run fixtures` | Vuelve a guardar las respuestas de la API en `src/fixtures/` (correr tras `make synth` o un refresh del scraper) |
| `npm run screenshots` | Regenera `docs/screenshots/` con el Chrome instalado y un Vite propio en el 5198 |

## Vistas

Arriba se elige la fuente de usuarios y eventos: **Simulados** o **Prototipo**, que son las pruebas hechas en `prototipo-app`. Con el prototipo casi todo queda vacío y el panel lo dice en cada bloque, con el mínimo que exige la API. La vista y la fuente quedan en la URL (`?vista=frecuencia&fuente=prototipo`), así que un enlace abre exactamente lo mismo.

### 1. Resumen

Lo primero es **Qué hacer esta semana**, armado desde los datos:

- la demanda no satisfecha con más usuarios;
- el concepto que más sube *y que sí tiene oferta*;
- los usuarios en riesgo, con la palanca de §5 que corresponde a cada uno.

Después vienen los 8 indicadores, cada uno con su definición y la ventana que usa la API, y la serie semanal:

- usuarios activos;
- pedidos;
- % de abandono de carrito;
- % de búsquedas sin resultado.

La serie compara la última semana completa con la de 4 semanas antes. La semana en curso va punteada y no entra en esa comparación.

![Resumen](docs/screenshots/1-resumen-escritorio-claro.jpg)

### 2. Oportunidades

**Demanda no satisfecha**, rankeada por usuarios. Cada fila trae qué se pide, en qué vertical, cuántos usuarios y búsquedas, el crecimiento, dónde existe y la acción sugerida.

**Conceptos que suben y bajan**: las últimas 4 semanas contra las 4 anteriores. Se marcan los que suben pero no tienen oferta.

![Oportunidades](docs/screenshots/2-oportunidades-escritorio-claro.jpg)

### 3. Frecuencia y abandono

- **Embudo por vertical** (buscan → agregan → inician pago → piden), con la conversión de cada paso y el paso donde más se pierde.
- **Retención por cohorte semanal**, como mapa de calor.
- **Distribución del ritmo de compra.**
- **Usuarios en riesgo y perdidos**: id seudónimo, estado, ritmo, días sin pedir, concepto top no sensible, consentimiento y acción.

![Frecuencia y abandono](docs/screenshots/3-frecuencia-escritorio-claro.jpg)

### 4. Entre verticales

- **Sugerencias de Bigotes**: cuántas se mostraron, aceptaron y convirtieron.
- **Afinidad dirigida A → B**: confianza P(B | A), lift y usuarios. Las aristas aprendidas de datos simulados **no las usa el agente**.
- **Retención multi-vertical vs un vertical por estrato**, con el mismo número de pedidos en cada comparación. Sirve para evitar la confusión obvia, pero no mide causa: eso solo lo da un A/B con holdout.

![Entre verticales](docs/screenshots/4-verticales-escritorio-claro.jpg)

### 5. Catálogo (real)

Sale de la muestra pública real:

- cobertura: obtenidos vs declarados por vertical;
- calidad: % sin imagen, sin categoría o sin concepto;
- productos presentes en 2 o más verticales.

Aparte va **surtido vs demanda**, marcado «demanda simulada».

![Catálogo](docs/screenshots/5-catalogo-escritorio-claro.jpg)

Todas las vistas tienen versión móvil (sin scroll horizontal; las tablas pasan a tarjetas) y tema claro y oscuro: sigue al sistema y se puede fijar con el botón.

<p>
  <img src="docs/screenshots/1-resumen-movil-claro.jpg" alt="Resumen en móvil" width="260" />
  <img src="docs/screenshots/3-frecuencia-escritorio-oscuro.jpg" alt="Frecuencia en tema oscuro" width="520" />
</p>

## Cómo se lee

- **Color con significado.** Un solo azul para magnitudes. El rojo queda **solo** para lo que empeora y para el riesgo, y el verde para lo que mejora; siempre van con flecha o ícono y texto, nunca solo por color. El ámbar rayado marca lo simulado.
- **Cada gráfico tiene su tabla.** El botón *Ver tabla* muestra todos los valores. Los gráficos se recorren con teclado: flechas en las series semanales y Tab en las columnas.
- Pestañas accesibles (← → Inicio Fin). Además se respeta `prefers-reduced-motion`.
- Paletas validadas con la skill *dataviz*: rampas ordinales y secuenciales, y contraste de texto ≥ 4,5:1 en ambos temas.

## Estructura

```text
src/
├── App.jsx                 pestañas, fuente, aviso de procedencia
├── lib/                    api.js (API + respaldo), format.js (es-CL), labels.js, hooks
├── components/             tarjeta, tabla, insignias, estados vacío/carga/error
│   ├── charts/             SVG propios: línea, columnas, barras, mapa de calor (sin librerías)
│   └── shell/              encabezado, selector de fuente, tema, pestañas
├── views/<vista>/          una carpeta por vista, con sus transformaciones y tests
├── fixtures/               respuestas guardadas de la API (tests y modo sin conexión)
└── test/                   API falsa para los tests de render
scripts/                    update-fixtures.mjs, screenshots.mjs
docs/screenshots/           capturas (en git solo las 7 que usa este README, comprimidas)
```

## Límites conocidos

**Datos simulados.** Los gráficos confirman los supuestos del simulador. No sirven para decidir hasta tener datos reales.

**Catálogo parcial.** El catálogo es una muestra: hasta 24 productos por sub-pasillo, y la descarga completa seguía en curso al 27-09-2026. Los números de cobertura cambian con cada corrida del scraper, y «no está» no significa «Rappi no lo vende».

**Serie semanal lenta.** `/analytics/weekly` tardó entre 7 y 28 s en las pruebas. Ese bloque puede quedar cargando un rato o, si pasa de 30 s, mostrarse con datos guardados (y el aviso lo dice).

**La API no entrega todo lo que pide §5.** Falta:

- la ciudad en las oportunidades;
- los cambios de precio del catálogo;
- el abandono de búsqueda.

Además, la lista de riesgo llega con máximo 50 filas y solo trae perdidos. El panel lo avisa en vez de esconderlo.
