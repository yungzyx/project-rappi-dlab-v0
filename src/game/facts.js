import { DATA, conceptsOf, formatNumber } from './data.js'

const label = (v) => DATA.labels[v]
const unit = (v) => (v === 'restaurantes' ? 'platos' : 'productos')
const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`)

// Producto puente y cadena de cada vertical: la primera fila que la incluye y que otra vertical anterior no usó,
// para que el álbum no repita el mismo nombre (si no queda ninguna sin usar, la primera).
function pickPerVertical(rows) {
  const used = new Set()
  return Object.fromEntries(
    DATA.order.map((v) => {
      const candidates = rows.filter(([, vs]) => vs.includes(v))
      const row = candidates.find(([name]) => !used.has(name)) ?? candidates[0]
      if (row) used.add(row[0])
      return [v, row]
    }),
  )
}
const BRIDGES = pickPerVertical(DATA.bridges)
const CHAINS = pickPerVertical(DATA.chains)

function verticalFacts(v) {
  const facts = [
    {
      id: `${v}-productos`,
      title: 'Tamaño',
      text: `${label(v)} tiene ${formatNumber(DATA.products[v])} ${unit(v)} en el catálogo.`,
    },
  ]
  const top = conceptsOf(v)[0]
  facts.push({
    id: `${v}-mas`,
    title: 'Lo que más hay',
    text: `${top.emoji} ${top.name} es lo que más hay en ${label(v)}: ${formatNumber(top.items[v])} ${unit(v)}.`,
  })
  const pairs = DATA.shared.filter(([a, b]) => a === v || b === v)
  if (pairs.length) {
    const [a, b, n] = pairs.reduce((best, p) => (p[2] > best[2] ? p : best))
    facts.push({
      id: `${v}-comparte`,
      title: 'Vecinas',
      text: `${label(v)} comparte ${formatNumber(n)} productos con ${label(a === v ? b : a)}, más que con cualquier otra vertical.`,
    })
  }
  const bridge = BRIDGES[v]
  if (bridge) {
    const [name, vs, stores] = bridge
    facts.push({
      id: `${v}-puente`,
      title: 'Producto puente',
      text: `${name} se vende en ${vs.length} de las 8 verticales, entre ellas ${label(v)}, en ${formatNumber(stores)} tiendas.`,
    })
  }
  const chain = CHAINS[v]
  if (chain) {
    const [name, vs] = chain
    facts.push({
      id: `${v}-cadena`,
      title: 'Cadena',
      text: `${name} está en ${vs.length} verticales: ${list(vs.map(label))}.`,
    })
  }
  facts.push({
    id: `${v}-conceptos`,
    title: 'Variedad',
    text: `${conceptsOf(v).length} de los ${DATA.concepts.length} conceptos del juego tienen ${DATA.minItems} o más ${unit(v)} en ${label(v)}.`,
  })
  return facts.map((f) => ({ ...f, vertical: v }))
}

function generalFacts() {
  const total = DATA.spread.reduce((s, [, n]) => s + n, 0)
  const one = DATA.spread.find(([k]) => k === 1)[1]
  const [most, mostCount] = DATA.spread.reduce((best, row) => (row[0] > best[0] ? row : best))
  return [
    {
      id: 'general-una-vertical',
      title: 'Todo Rappi',
      text: `${Math.round((one / total) * 100)} de cada 100 productos del catálogo se venden en una sola vertical; solo ${formatNumber(mostCount)} están en ${most} verticales.`,
    },
    {
      id: 'general-catalogo',
      title: 'Todo Rappi',
      text: `Sin contar restaurantes, el catálogo tiene ${formatNumber(DATA.catalogTotal)} productos distintos.`,
    },
  ].map((f) => ({ ...f, vertical: null }))
}

/** Cartas «¿Sabías que…?»: por vertical en el orden del mapa y al final las generales. */
export const FACTS = [...DATA.order.flatMap(verticalFacts), ...generalFacts()]

export function factsOf(vertical) {
  return FACTS.filter((f) => f.vertical === vertical)
}
