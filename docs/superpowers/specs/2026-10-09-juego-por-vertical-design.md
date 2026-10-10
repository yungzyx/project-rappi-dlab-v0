# Juego por vertical: conocimiento de cada mundo y Viajes en el pasaporte

> Especificación · 09-10-2026 · Estado: **para revisión del usuario** (diseño aprobado en conversación por partes)

## 1. Para qué

Hoy las rondas del pasaporte salen solo del catálogo («lo típico», «qué combina», «nunca junto», cifras) y los datos
curiosos del álbum son estadísticas («Súper tiene 4.000 productos»). La propuesta: que cada vertical enseñe **su
mundo** —el cacao y la industria del chocolate en Chocolatería, el vino y el pisco en Licores, destinos y aviones en
Viajes— con datos freak, preguntas interesantes y datos curiosos, **todos ciertos y con fuente**. Súper, Express y
Turbo, que no tienen un tema único, traen contenido variado. Y **Viajes** entra al pasaporte.

### Criterios de éxito

1. Cada una de las 9 verticales del pasaporte tiene 12 tarjetas propias (6 «¿Sabías que…?» y 6 preguntas), en
   español, escritas con palabras propias y cada una con su fuente (título y enlace).
2. Cada dato fue verificado contra su fuente antes de entrar; ninguno inventado. Lo que no se pudo verificar no entra.
3. Una ronda trae 5 pasos: 2 datos, 2 preguntas de conocimiento y 1 pregunta del catálogo (Viajes: 5 de conocimiento).
4. Viajes es el sello 9: se sella al abrir RappiTravel o al jugar su ronda.
5. Los niveles cuentan tarjetas en vez de conceptos; quien ya jugó conserva sellos, XP, racha y cartas abiertas.
6. Tests nuevos (incluida una validación de todo el contenido), `npm test` y `npm run lint` en verde, revisado en el
   navegador. Solo cambia el juego del prototipo final; «Rappi hoy» no tiene juego.

## 2. Contenido

### Por vertical (12 tarjetas cada una: 6 datos + 6 preguntas)

| Vertical | De qué trata |
|---|---|
| Chocolatería | Cacao, historia del chocolate, cómo se hace, la industria |
| Licores (+18) | Vino, pisco, cerveza y destilados: historia, elaboración, Chile. Nada que incite a beber |
| Restaurantes | Gastronomía: platos, su historia, cocinas del mundo y de Chile |
| Rappi Mall | Diseño, objetos de todos los días, tecnología y regalos |
| Farmacia | Historia de los remedios y curiosidades del cuerpo. Sin consejos médicos; Mochi sigue sin ofrecerla |
| Viajes | Destinos, aviones, aeropuertos y curiosidades de viajar |
| Súper, Express, Turbo | Variado: ciencia de los alimentos, productos de todos los días, curiosidades de Chile; Turbo suma lo rápido (logística, delivery) |

### Forma de una tarjeta

```js
{ id: 'chocolateria-01', vertical: 'chocolateria', kind: 'dato', title: 'De semilla a barra',
  text: '…', source: { title: '…', url: 'https://…' } }
{ id: 'chocolateria-07', vertical: 'chocolateria', kind: 'pregunta', question: '…',
  options: ['…', '…', '…'], answer: 1, explanation: '…', source: { title: '…', url: 'https://…' } }
```

- Textos cortos (dato: hasta 200 caracteres; pregunta: hasta 140; cada alternativa: hasta 60; explicación: hasta 200).
- Escritos con palabras propias: nada copiado de la fuente.
- Fuentes de calidad, en este orden: organismos oficiales e internacionales (FAO, OMS, OIV, INE, SAG, ICCO, OACI),
  museos y universidades, enciclopedias (Wikipedia como mínimo aceptable). Cifras con su año.
- Viven en `prototipo-app/src/game/knowledge.json` (contenido propio con enlaces; no son datos descargados).

## 3. Rondas, álbum y niveles

- **Ronda (5 pasos, orden mezclado):** 2 datos sin descubrir de la vertical (se dan vuelta y van al álbum), 2
  preguntas de conocimiento sin responder bien todavía y 1 pregunta del catálogo (la de hoy, de `challenges.js`).
  Viajes: 2 datos + 3 preguntas. Si se acaban las nuevas, se repiten las ya vistas.
- **Álbum:** guarda las tarjetas «¿Sabías que…?» descubiertas, por vertical, cada una con «Fuente: …» (enlace).
  Salen los datos del catálogo actuales.
- **Niveles** (mismas reglas, contando tarjetas): Explorador = abriste la vertical o tienes 1 tarjeta; Conocedor = la
  mitad de sus tarjetas y 3 aciertos; Experto = todas sus tarjetas y 8 aciertos. «Conoce Rappi» = Conocedor en las 9.
- **Textos:** «Descubriste N de 108 datos»; en la hoja de la vertical, «Ver datos» en vez de «Ver conceptos».
- **Progreso guardado:** se conservan sellos (`visited`), XP, racha y cartas abiertas; los conceptos descubiertos
  dejan de contar para el nivel (puede bajar de Conocedor a Explorador).

## 4. Viajes

- Id del juego `viajes` ↔ pantalla `travel`; ícono de avión y color propio; sello 9 (la meta sigue en 4).
- Se sella al abrir RappiTravel o al jugar su ronda. Mochi puede proponerla (no es sensible) y entra en la ronda que se
  juega mientras llega un pedido.
- Sin catálogo: no está en el mapa de conceptos y sus rondas no traen pregunta del catálogo.

## 5. Investigación y verificación

1. Una búsqueda por vertical (en paralelo): candidatos de datos y preguntas con su fuente.
2. Verificación de cada tarjeta contra su fuente (se abre el enlace y se confirma la afirmación y la cifra). Lo que
   no se confirma se descarta o se reemplaza.
3. Revisión final de tono y largo; un test valida la forma de todo el contenido (ids, vertical, largos, respuesta
   dentro de las alternativas, enlaces https, 12 por vertical).

## 6. Trabajo, en dos PRs

1. **Motor y Viajes:** modelo de tarjetas, rondas mezcladas, álbum con fuente, niveles por tarjetas, Viajes en el
   pasaporte, con un contenido inicial verificado de 2 verticales (Chocolatería y Viajes) para probar todo.
2. **Contenido completo:** las 9 verticales investigadas y verificadas, con el informe de verificación.

## 7. Fuera de alcance

- Generar preguntas con IA en vivo.
- RappiFavor en el pasaporte.
- Cambiar la meta del envío gratis (sigue en 4 sellos).
