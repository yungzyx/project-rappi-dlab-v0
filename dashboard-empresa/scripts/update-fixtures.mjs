// Guarda una foto de cada respuesta de la API en src/fixtures (npm run fixtures).
// Sirven para los tests y para el modo sin conexión. Volver a correrlo después de `make synth` o de un refresh.
// Cada respuesta de /analytics lleva su `guardado` ({ origen, fecha }): el panel lo muestra en el aviso de «sin conexión».
// offers, game y unmet no se guardan aquí: las escribe `make contract` en rappi-ia.
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const API_URL = (process.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')
const OUT = fileURLToPath(new URL('../src/fixtures/', import.meta.url))
const ANALYTICS = [
  'kpis',
  'weekly',
  'opportunities',
  'trends',
  'funnel',
  'cohorts',
  'rhythm',
  'at-risk',
  'suggestions',
  'services',
  'multi-vertical',
  'affinity',
  'assortment',
]
const SOURCES = ['synthetic', 'prototype']

const ORIGINS = {
  synthetic: 'simulación de la base local',
  prototype: 'uso del prototipo en la base local (no es evidencia)',
  catalog: 'muestra pública de rappi.cl',
}
const targets = [
  ...ANALYTICS.flatMap((name) =>
    SOURCES.map((source) => [`${name}.${source}`, `/analytics/${name}?source=${source}`, ORIGINS[source]]),
  ),
  ['catalog', '/analytics/catalog', ORIGINS.catalog],
  ['concepts', '/concepts'],
  ['health', '/health'],
]

async function main() {
  mkdirSync(OUT, { recursive: true })
  const fecha = new Date().toLocaleDateString('en-CA') // AAAA-MM-DD en la hora local
  for (const [file, path, origen] of targets) {
    const response = await fetch(`${API_URL}${path}`)
    if (!response.ok) throw new Error(`${path} respondió ${response.status}`)
    const body = await response.json()
    if (origen) body.guardado = { origen: `npm run fixtures · ${origen}`, fecha }
    writeFileSync(`${OUT}${file}.json`, `${JSON.stringify(body, null, 2)}\n`)
    console.log(`  ✓ ${file}`)
  }
}

main().catch((error) => {
  console.error(`No se pudieron guardar las respuestas de ${API_URL}: ${error.message}`)
  process.exitCode = 1
})
