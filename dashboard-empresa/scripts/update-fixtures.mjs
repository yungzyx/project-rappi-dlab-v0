// Guarda una foto de cada respuesta de la API en src/fixtures (npm run fixtures).
// Sirven para los tests y para el modo sin conexión. Volver a correrlo después de `make synth` o de un refresh.
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

const targets = [
  ...ANALYTICS.flatMap((name) => SOURCES.map((source) => [`${name}.${source}`, `/analytics/${name}?source=${source}`])),
  ['catalog', '/analytics/catalog'],
  ['concepts', '/concepts'],
  ['health', '/health'],
]

async function main() {
  mkdirSync(OUT, { recursive: true })
  for (const [file, path] of targets) {
    const response = await fetch(`${API_URL}${path}`)
    if (!response.ok) throw new Error(`${path} respondió ${response.status}`)
    writeFileSync(`${OUT}${file}.json`, `${JSON.stringify(await response.json(), null, 2)}\n`)
    console.log(`  ✓ ${file}`)
  }
}

main().catch((error) => {
  console.error(`No se pudieron guardar las respuestas de ${API_URL}: ${error.message}`)
  process.exitCode = 1
})
