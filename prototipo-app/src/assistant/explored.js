// Verticales que la persona ya abrió en esta pestaña: Bigotes invita a descubrir las que faltan.
const KEY = 'rappi-explored'

/** Las verticales que se pueden explorar, en el orden de la Home (ids de pantalla, los de VERTICAL_NAMES). */
export const EXPLORABLE = [
  'restaurants',
  'turbo',
  'grocery',
  'pharmacy',
  'retail',
  'liquor',
  'express',
  'pet',
  'chocolates',
]

export function exploredVerticals() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(KEY) ?? '[]')
    return Array.isArray(stored) ? stored.filter((vertical) => EXPLORABLE.includes(vertical)) : []
  } catch {
    return [] // modo privado o almacenamiento bloqueado: se parte de cero
  }
}

export function markExplored(vertical) {
  if (!EXPLORABLE.includes(vertical)) return
  const explored = exploredVerticals()
  if (explored.includes(vertical)) return
  try {
    sessionStorage.setItem(KEY, JSON.stringify([...explored, vertical]))
  } catch {
    // sin almacenamiento, el progreso solo dura mientras la pantalla está abierta
  }
}
