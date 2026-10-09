// Lee el objeto DATA del «04 Mapa multivertical» y escribe src/data/verticales.json sin conceptos sensibles.
// Uso: npm run datos -- "<ruta al 04 Mapa multivertical.html>"
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = process.argv[2]
if (!source) {
  console.error('Falta la ruta al «04 Mapa multivertical.html».')
  process.exit(1)
}
const match = readFileSync(source, 'utf8').match(/const DATA = (\{.*?\});\n/s)
if (!match) {
  console.error(`No encontré «const DATA = {…};» en ${source}.`)
  process.exit(1)
}
const data = JSON.parse(match[1])
// Fuera: los sensibles y los que no pertenecen a ninguna vertical (menos de minItems productos en todas),
// porque no se podrían descubrir en el juego.
const playable = (c) => !c.sensitive && Object.values(c.items).some((n) => n >= data.minItems)
const keep = new Set(data.concepts.filter(playable).map((c) => c.id))
const sensitive = new Set(data.concepts.filter((c) => c.sensitive).map((c) => c.id))
const clean = (edges) => edges.filter(([a, b]) => keep.has(a) && keep.has(b))
// Productos y cadenas no traen concepto en el 04: los de salud sexual y tabaco se descartan por nombre.
const SENSITIVE_NAME = /preservativo|cond[oó]n|lubricante|sexual|cigarr|tabaco|vape|vaper|nicotina/i
const cleanNamed = (rows) => rows.filter(([name]) => !SENSITIVE_NAME.test(name))

const out = {
  asOf: data.as_of,
  order: data.order,
  labels: data.labels,
  minItems: data.minItems,
  products: data.products,
  catalogTotal: data.catalogTotal,
  concepts: data.concepts
    .filter((c) => keep.has(c.id))
    .map(({ id, name, emoji, group, home, items, total }) => ({ id, name, emoji, group, home, items, total })),
  complements: clean(data.complements),
  substitutes: clean(data.substitutes),
  conflicts: clean(data.conflicts),
  bridges: cleanNamed(data.bridges),
  chains: cleanNamed(data.chains),
  shared: data.shared,
  spread: data.spread,
}
const target = fileURLToPath(new URL('../src/data/verticales.json', import.meta.url))
writeFileSync(target, JSON.stringify(out, null, 2) + '\n')
console.log(
  `Listo: ${out.concepts.length} conceptos (${sensitive.size} sensibles descartados) → src/data/verticales.json`,
)
