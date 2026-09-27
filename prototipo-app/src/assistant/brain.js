// Respuestas simuladas del asistente. Todo sale de los datos del prototipo; nada va a internet.
// Una respuesta es { text, products?, stores?, actions?: [{ label, route }], reason?, tags? }.
// `tags` son los temas que usó para responder; con ellos aprende el perfil.
import { search } from '../data/catalog'
import { COMPLEMENTS, TAGS, normalize, productsForTags, storesForTags, tagsOf, topDiscounts } from './tags'

export const ASSISTANT_NAME = 'Bigotes'

// Frases que no nombran un producto pero sí una ocasión.
const OCCASIONS = [
  {
    words: ['asado', 'parrilla', 'quincho'],
    tags: ['carne', 'cerveza', 'fresco'],
    text: '¡Asado! 🔥 Te armé lo básico: carne, chelas y algo verde pa acompañar.',
  },
  {
    words: ['carrete', 'fiesta', 'previa', 'amigos', 'juntada'],
    tags: ['cerveza', 'licor', 'snack'],
    text: '¡Buena! 🍻 Para el carrete te sugiero esto. Las botillerías llegan en ~25 min.',
  },
  {
    words: ['regalo', 'cumpleanos', 'aniversario', 'sorpresa'],
    tags: ['belleza', 'dulce'],
    text: 'Un regalo que nunca falla 🎁: perfume o chocolates. Mira estas ofertas:',
  },
  {
    words: ['hambre', 'almuerzo', 'almorzar', 'cena', 'comer', 'comida'],
    tags: ['hamburguesa', 'pizza', 'sushi'],
    text: '¿Hambre? 😋 Estos restaurantes llegan rápido y con envío gratis:',
    storesOnly: true,
  },
  {
    words: ['guagua', 'bebe', 'panal'],
    tags: ['bebe', 'farmacia'],
    text: 'Para la guagua 🍼 encontré pañales con 28% de descuento:',
  },
  {
    words: ['enfermo', 'resfrio', 'dolor', 'remedio'],
    tags: ['farmacia'],
    text: 'Que te mejores 💛 Estas farmacias te lo llevan hoy:',
  },
]

const SHORTCUTS = [
  { words: ['barato', 'oferta', 'descuento', 'promo'], build: () => ({ text: 'Las ofertas más fuertes de hoy 🔥', products: topDiscounts() }) },
  { words: ['viaje', 'hotel', 'vuelo', 'vacaciones'], build: () => ({ text: 'Con RappiTravel tienes hasta 40% OFF en hoteles siendo Pro ✈️', actions: [{ label: 'Abrir RappiTravel', route: ['travel'] }] }) },
  { words: ['puntos', 'millas', 'latam', 'loyalty'], build: () => ({ text: 'Puedes acumular millas o puntos en cada pedido siendo Pro 🏆', actions: [{ label: 'Elegir programa', route: ['loyalty'] }] }) },
  { words: ['hola', 'buenas', 'wena', 'hey'], build: () => ({ text: `¡Hola! 👋 Soy ${ASSISTANT_NAME}. Pídeme lo que quieras: comida, súper, farmacia o un regalo.` }) },
  { words: ['gracias', 'vale', 'bacan'], build: () => ({ text: '¡De nada! 🧡 Aquí estoy si necesitas algo más.' }) },
]

const matches = (text, words) => words.some((word) => text.includes(word))

function forTags(tags, text, storesOnly = false) {
  return {
    tags,
    text,
    products: storesOnly ? [] : productsForTags(tags),
    stores: storesForTags(tags),
  }
}

/** Respuesta a lo que escribió o dijo el usuario. */
export function reply(input, profile) {
  const text = normalize(input)

  const shortcut = SHORTCUTS.find((item) => matches(text, item.words))
  if (shortcut) return shortcut.build()

  const occasion = OCCASIONS.find((item) => matches(text, item.words))
  if (occasion) return forTags(occasion.tags, occasion.text, occasion.storesOnly)

  const tags = tagsOf(text)
  if (tags.length > 0) {
    const labels = tags.map((tag) => `${TAGS[tag].emoji} ${TAGS[tag].label.toLowerCase()}`).join(' y ')
    const response = forTags(tags, `Esto encontré de ${labels}:`)
    const extra = COMPLEMENTS[tags[0]]?.[0]
    if (extra) response.reason = `Tip: a quienes piden ${TAGS[tags[0]].label.toLowerCase()} también les gusta ${TAGS[extra].emoji} ${TAGS[extra].label.toLowerCase()}.`
    return response
  }

  const found = search(input)
  if (found.stores.length + found.products.length > 0) {
    const products = found.products.filter((product) => !product.partial).slice(0, 8)
    return { text: `Encontré esto para “${input.trim()}”:`, products, stores: found.stores.slice(0, 6) }
  }

  const picks = forYou(profile)
  return {
    text: 'Mmm, eso no lo encontré 😅 ¿Probamos con otra palabra? Mientras, mira esto que te puede gustar:',
    products: picks.products,
    reason: picks.reason,
  }
}

/** "Para ti": lo que acompaña al interés principal, de otra vertical. */
export function forYou(profile) {
  const [first] = profile.top
  if (!first) return { products: topDiscounts(6), reason: null }
  const tags = COMPLEMENTS[first] ?? [first]
  return {
    products: productsForTags(tags, 6),
    reason: `Porque te interesa ${TAGS[first].emoji} ${TAGS[first].label.toLowerCase()}`,
  }
}

export function greeting(profile) {
  const [first] = profile.top
  if (!first) return `¡Hola! Soy ${ASSISTANT_NAME}, tu asistente Rappi 🧡 ¿Qué se te antoja hoy?`
  return `¡Hola de nuevo! 🧡 Vi que te gusta ${TAGS[first].emoji} ${TAGS[first].label.toLowerCase()}. ¿Te armo algo?`
}

const DEFAULT_SUGGESTIONS = ['🍔 ¿Qué almuerzo hoy?', '🍻 Arma un carrete', '🔥 Ofertas de hoy', '🍫 Algo dulce', '🎁 Un regalo']

/** Sugerencias en chips: al principio genéricas, después según lo que el usuario ha mostrado interés. */
export function suggestions(profile) {
  const personal = profile.top.slice(0, 2).flatMap((tag) => {
    const [complement] = COMPLEMENTS[tag] ?? []
    const own = `${TAGS[tag].emoji} Más ${TAGS[tag].label.toLowerCase()}`
    return complement ? [own, `${TAGS[complement].emoji} ${TAGS[complement].label} para acompañar`] : [own]
  })
  return [...new Set([...personal, ...DEFAULT_SUGGESTIONS])].slice(0, 6)
}

/** Reconocimiento de foto simulado: responde con lo que le interesa al usuario (o las ofertas). */
export function photoReply(profile) {
  const picks = forYou(profile)
  return {
    text: '¡Qué buena pinta! 📸 Busqué cosas parecidas en las tiendas cerca tuyo:',
    products: picks.products,
    reason: 'Demo: el reconocimiento de imagen está simulado.',
  }
}

// Frases de ejemplo para la voz simulada; van rotando.
export const VOICE_SAMPLES = ['Arma un carrete para cuatro', 'Algo rico para almorzar', 'Necesito pañales para la guagua', 'Un regalo de cumpleaños']
