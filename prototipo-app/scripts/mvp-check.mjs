// Revisa en un Chrome real que la app del MVP responda como debe (lo corre scripts/mvp-check.sh con `make mvp-check`).
// Uso: node scripts/mvp-check.mjs --app http://localhost:5184 [--api http://localhost:8010] [--shop | --kit | --game [--user-file ruta] | --dato | --expect-offline | --panel http://localhost:5185]
//   sin banderas: la app abre en la Home conectada, con la barra «Busca o pídele ideas a <agente>»;
//   con --shop: Home → vertical Grocery → primera tienda → agregar un producto → carrito → pagar, y la API recibe el
//     pedido (que después verifica scripts/mvp-check.sh en la base de prueba);
//   con --kit: busca «cerveza» en el buscador con Mochi (ve la búsqueda agrupada por vertical), vuelve a la Home, elige
//     la ocasión «Carrete», agrega el kit que arma Mochi (`plan`) y paga; scripts/mvp-check.sh verifica después en la base
//     de prueba que el pedido tiene líneas sembradas y al menos una aceptación `agent-plan`;
//   con --game: abre el juego desde el pasaporte de la Home, empieza una ronda en el Súper, ve como primer paso el primer
//     dato de `GET /game/cards?vertical=supermercado` (de --api), lo da vuelta y sigue; scripts/mvp-check.sh verifica
//     después en la base de prueba que el progreso de esa persona quedó guardado con esa tarjeta en `discovered`; el id de la
//     persona (el `rappi-proto-user` del navegador) se deja en el archivo de `--user-file`;
//   con --dato: en el buscador con Mochi toca «Algo dulce» y ve el bloque «¿Sabías que…?» con su fuente en la respuesta;
//   con --expect-offline: la API está detenida y la app muestra «Sin conexión con <agente>»;
//   con --panel <url del panel> (sin --app): corre después de las demás, con la API en marcha. Espera a que la API ya
//     cuente lo que dejaron el kit (una oferta aceptada en «Plan») y el juego (una tarjeta), abre el panel en «Uso del MVP»
//     con la fuente del prototipo y ve esas cifras ahí, con el rótulo «uso del MVP, pocas personas: no es evidencia» y
//     sin el aviso de datos guardados (que taparía una API que no responde).
// Con la API en marcha (sin --expect-offline) también falla ante un error de la página o de la consola, o una respuesta
// 4xx/5xx, desde la primera carga; solo se ignoran las imágenes del catálogo de prueba, que no existen.
// Sale con 0 si la revisión pasa y con 1 si no. Usa el Chrome instalado (playwright-core, sin descargar navegadores).
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright-core'
import { AGENT_NAME } from '../src/agent/name.js'
import { LABELS } from '../src/game/verticals.js'

// Los textos visibles llevan el nombre del agente: salen de la misma constante que usa la app.
const HOME_HINT = `Busca o pídele ideas a ${AGENT_NAME}`
const OFFLINE_TITLE = `Sin conexión con ${AGENT_NAME}`
const SEARCH_DIALOG = `Buscador con ${AGENT_NAME}`
const API_DEFAULT = 'http://localhost:8010'
const TIMEOUT_MS = 20_000 // la barra rota tres frases cada 3,2 s: la de Mochi tarda hasta ~6 s en salir

/** Qué dice la página ahora: ayuda a entender por qué falló una espera. */
async function pageSays(page) {
  const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim())
  return text ? `la página dice «${text.slice(0, 120)}»` : 'la página está en blanco'
}

async function checkOnline(page) {
  const bar = page.locator('.smart-bar-hint', { hasText: HOME_HINT }).first()
  try {
    await bar.waitFor({ timeout: TIMEOUT_MS })
  } catch {
    throw new Error(`no apareció la barra «${HOME_HINT}»: ${await pageSays(page)}`)
  }
  if ((await page.getByRole('heading', { name: OFFLINE_TITLE }).count()) > 0) {
    throw new Error(`apareció «${OFFLINE_TITLE}» con la API en marcha`)
  }
  return `la Home abre con la barra «${HOME_HINT}»`
}

/**
 * Lo que la revisión vigila, enganchado antes de abrir la página (lo que falla al cargar no se puede recuperar después):
 * errores de la página, errores de la consola y respuestas 4xx/5xx. Las imágenes del catálogo de prueba no existen (la app
 * muestra la de reemplazo), así que solo las cargas de imágenes se ignoran. Devuelve la lista, que se va llenando.
 */
function watchProblems(page) {
  const problems = []
  page.on('pageerror', (error) => problems.push(error.message))
  // Una carga fallida sale por su respuesta (abajo), con su URL: la consola solo la repite sin decir cuál fue.
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource'))
      problems.push(message.text())
  })
  page.on('response', (response) => {
    const request = response.request()
    if (response.status() >= 400 && request.resourceType() !== 'image')
      problems.push(`${request.method()} ${response.url()} → ${response.status()}`)
  })
  return problems
}

/** Recorre una compra real contra el catálogo de prueba. Los textos son los de la app (Grocery, View cart, Place order). */
async function checkShop(page) {
  await checkOnline(page)
  await step(page, 'abrir Grocery desde la Home', () =>
    page.getByRole('button', { name: 'Grocery', exact: true }).click(),
  )
  const stores = page.getByRole('region', { name: 'Tiendas' })
  await step(page, 'ver las tiendas de Grocery', () => stores.waitFor())
  await step(page, 'abrir la primera tienda', () =>
    stores
      .getByRole('button', { name: /de prueba/ })
      .first()
      .click(),
  )
  const store = await step(page, 'ver el nombre de la tienda', async () => {
    const heading = page.getByRole('heading', { level: 1 })
    await heading.waitFor()
    return heading.innerText()
  })
  // Solo los productos: el corazón de favoritos también empieza con «Agregar».
  const product = page
    .getByRole('listitem')
    .getByRole('button', { name: /^Agregar / })
    .first()
  await step(page, 'ver productos en la tienda', () => product.waitFor())
  await step(page, 'agregar un producto', () => product.click())
  await step(page, 'abrir el carrito', () => page.getByRole('button', { name: /View cart/ }).click())
  await step(page, 'ir al checkout', () => page.getByRole('button', { name: 'Go to checkout' }).click())
  const place = page.getByRole('button', { name: /^Place order/ })
  await step(page, 'ver el botón de pagar', () => place.waitFor())
  const posted = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/orders')
  await place.click()
  const response = await posted.catch(() => {
    throw new Error('la app no mandó el pedido a la API (POST /orders)')
  })
  if (!response.ok()) throw new Error(`la API rechazó el pedido (POST /orders → ${response.status()})`)
  return `compró en «${store}» y la API aceptó el pedido`
}

/**
 * Busca «cerveza» con Mochi (grupos por vertical), pide el kit de «Carrete» en la Home, lo agrega y paga. Los textos son
 * los de la app (Buscador con Mochi, Plan de hoy, Agregar el kit, Ir a pagar, Place order).
 */
async function checkKit(page) {
  await checkOnline(page)
  await step(page, 'abrir el buscador con Mochi', () => page.locator('.smart-bar').first().click())
  const panel = page.getByRole('dialog', { name: SEARCH_DIALOG })
  await step(page, 'escribir «cerveza»', () =>
    panel.getByRole('searchbox', { name: 'Buscar en Rappi' }).fill('cerveza'),
  )
  const groups = panel.locator('section[aria-labelledby] > h2')
  await step(page, 'ver la búsqueda agrupada por vertical', () => groups.first().waitFor())
  // El catálogo de prueba vende cerveza en tres verticales (licores, conveniencia y supermercado).
  const found = await step(page, 'contar los grupos de la búsqueda', async () => {
    await panel
      .getByText(/^Cerveza rubia/)
      .first()
      .waitFor()
    return groups.count()
  })
  if (found < 2) throw new Error(`«cerveza» salió en ${found} grupo(s) y se esperaban al menos 2`)
  await step(page, 'cerrar el buscador', () => panel.locator('.search-back').click())
  await step(page, 'ver que el buscador se cerró', () => panel.waitFor({ state: 'detached' }))
  await step(page, 'elegir la ocasión «Carrete»', () => page.getByRole('radio', { name: /Carrete/ }).click())
  await step(page, 'ver el kit de Mochi', () => page.locator('.live-kit-meta').waitFor())
  // Agregar el kit registra una aceptación por producto; la app las manda en lotes cada 5 s.
  const accepted = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname === '/events' &&
      (r.request().postData() ?? '').includes('suggestion_accepted'),
    { timeout: TIMEOUT_MS },
  )
  accepted.catch(() => {}) // si no llega, falla abajo con su propio mensaje
  await step(page, 'agregar el kit', () => page.getByRole('button', { name: /^Agregar el kit/ }).click())
  await step(page, 'ir a pagar', () => page.getByRole('button', { name: /Ir a pagar/ }).click())
  const place = page.getByRole('button', { name: /^Place order/ })
  await step(page, 'ver el botón de pagar', () => place.waitFor())
  const posted = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/orders')
  await place.click()
  const response = await posted.catch(() => {
    throw new Error('la app no mandó el pedido a la API (POST /orders)')
  })
  if (!response.ok()) throw new Error(`la API rechazó el pedido (POST /orders → ${response.status()})`)
  await accepted.catch(() => {
    throw new Error('la app no registró la aceptación del kit (POST /events con suggestion_accepted)')
  })
  return `buscó «cerveza» (${found} grupos), pidió el kit «Carrete», lo agregó y la API aceptó el pedido`
}

/**
 * Abre el juego con «Jugar» del pasaporte de la Home, empieza una ronda en el Súper y comprueba que el primer paso es el
 * primer dato que sirve la API; al darlo vuelta y seguir, la app guarda el progreso (lo verifica scripts/mvp-check.sh).
 */
async function checkGame(page, api, userFile) {
  await checkOnline(page)
  const first = await step(page, 'pedir las tarjetas del Súper a la API', async () => {
    const reply = await fetch(`${api}/game/cards?vertical=supermercado`)
    if (!reply.ok) throw new Error(`GET /game/cards → ${reply.status}`)
    const dato = (await reply.json()).cards.find((card) => card.kind === 'dato')
    if (!dato) throw new Error('la API no tiene ningún dato del Súper')
    return dato
  })
  await step(page, 'abrir el juego desde el pasaporte', () =>
    page.getByRole('button', { name: 'Jugar', exact: true }).click(),
  )
  await step(page, 'cerrar la bienvenida', () => page.getByRole('button', { name: 'Ver el camino primero' }).click())
  const path = page.getByRole('region', { name: 'Camino de verticales' })
  // El nodo donde está el agente pulsa sin parar y Playwright nunca lo da por estable: se toca sin esperar a que se quede quieto.
  await step(page, 'abrir el sello del Súper', () =>
    path.getByRole('button', { name: new RegExp(`^${LABELS.supermercado}:`) }).click({ force: true }),
  )
  await step(page, 'empezar la ronda del Súper', () =>
    page.getByRole('dialog').getByRole('button', { name: 'Jugar', exact: true }).click(),
  )
  await step(page, 'ver el primer dato de la ronda', () => page.getByText('¿Sabías que…?').first().waitFor())
  // Descubrir la tarjeta registra `game_card_discovered`; la app manda los eventos en lotes cada 5 s, y el panel los lee.
  const discovered = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname === '/events' &&
      (r.request().postData() ?? '').includes('game_card_discovered'),
    { timeout: TIMEOUT_MS },
  )
  discovered.catch(() => {}) // si no llega, falla abajo con su propio mensaje
  await step(page, 'dar vuelta el dato', () => page.getByRole('button', { name: 'Dar vuelta' }).click())
  const title = await step(page, 'ver el título del dato', async () => {
    const heading = page.getByRole('heading', { level: 2, name: first.title })
    await heading.waitFor()
    return heading.innerText()
  })
  await step(page, 'seguir al próximo paso', () => page.getByRole('button', { name: 'Continuar' }).click())
  await step(page, 'ver la pregunta que sigue', () => page.getByRole('group', { name: 'Opciones' }).waitFor())
  await discovered.catch(() => {
    throw new Error('la app no registró la tarjeta descubierta (POST /events con game_card_discovered)')
  })
  if (userFile) {
    const user = await step(page, 'leer el id de la persona del navegador', () =>
      page.evaluate(() => localStorage.getItem('rappi-proto-user')),
    )
    if (!user) throw new Error('el navegador no tiene id de persona (rappi-proto-user)')
    writeFileSync(userFile, user)
  }
  return `la ronda del Súper abre con «${title}» (el primer dato de la API) y avanza un paso`
}

/**
 * Le pide ideas al agente con el chip «Algo dulce» (no hay otra forma de escribirle desde el buscador) y ve en su
 * respuesta el bloque «¿Sabías que…?» con título, texto y fuente. La persona es nueva, así que el dato no se ha visto.
 */
async function checkDato(page) {
  await checkOnline(page)
  await step(page, 'abrir el buscador con Mochi', () => page.locator('.smart-bar').first().click())
  const panel = page.getByRole('dialog', { name: SEARCH_DIALOG })
  await step(page, 'tocar «Algo dulce»', () => panel.getByRole('button', { name: /Algo dulce/ }).click())
  const fact = panel.getByRole('note', { name: '¿Sabías que…?' })
  await step(page, 'ver el «¿Sabías que…?» en la respuesta', () => fact.waitFor())
  const title = await fact.locator('.agent-msg-fact-title').innerText()
  const text = await fact.locator('.agent-msg-fact-text').innerText()
  if (!title.trim() || !text.trim()) throw new Error('el «¿Sabías que…?» salió vacío')
  if ((await fact.getByRole('link').count()) === 0) throw new Error('el «¿Sabías que…?» no trae su fuente')
  return `la respuesta del agente trae el «¿Sabías que…?» «${title}» con su fuente`
}

/** Cuánto se espera a que la API cuente los eventos de las revisiones anteriores (la app los manda en lotes cada 5 s). */
const EVENTS_WAIT_MS = 30_000
const NOT_EVIDENCE = 'uso del MVP, pocas personas: no es evidencia'

/** Pide una métrica del panel a la API hasta que `ready` diga que ya tiene lo esperado; si no llega, dice qué faltó. */
async function waitForMetric(api, name, ready, missing) {
  const deadline = Date.now() + EVENTS_WAIT_MS
  let last = 'sin respuesta'
  while (Date.now() < deadline) {
    try {
      const reply = await fetch(`${api}/analytics/${name}?source=prototype`)
      if (reply.ok) {
        const { data } = await reply.json()
        if (ready(data)) return data
        last = 'todavía sin eventos'
      } else {
        last = `GET /analytics/${name} → ${reply.status}`
      }
    } catch (error) {
      last = error.message
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(
    `no pude ver ${missing} en GET /analytics/${name} de la API tras ${EVENTS_WAIT_MS / 1000} s (${last})`,
  )
}

/** Abre «Uso del MVP» del panel con los datos del prototipo y ve lo que dejaron las revisiones anteriores. */
async function checkPanel(page, panel, api) {
  const plan = await waitForMetric(
    api,
    'offers',
    (data) => data.momentos.some((row) => row.momento === 'plan' && row.aceptadas >= 1),
    'una oferta aceptada del kit en «Plan»',
  )
  const game = await waitForMetric(api, 'game', (data) => data.tarjetas >= 1, 'una tarjeta descubierta en el juego')
  await page.goto(`${panel}/?vista=mvp&fuente=prototipo`, { timeout: TIMEOUT_MS })
  const offers = page.getByRole('table', { name: 'Ofertas del agente por momento' })
  await step(page, 'ver la tabla «Ofertas del agente por momento»', () => offers.waitFor())
  const accepted = await step(page, 'leer las ofertas aceptadas de «Plan»', async () => {
    const row = offers.getByRole('row', { name: /^Plan / })
    await row.waitFor()
    return Number((await row.getByRole('cell').nth(2).innerText()).replace(/\D/g, ''))
  })
  if (!(accepted >= 1)) throw new Error(`«Plan» muestra ${accepted} aceptadas y se esperaba al menos 1`)
  const cards = page.getByRole('table', { name: 'Juego por vertical' })
  await step(page, 'ver la tabla «Juego por vertical»', () => cards.waitFor())
  const shown = await step(page, 'leer las tarjetas del juego', async () =>
    Number(
      (
        await page
          .locator('dt', { hasText: /^Tarjetas$/ })
          .locator('xpath=following-sibling::dd')
          .innerText()
      ).replace(/\D/g, ''),
    ),
  )
  if (!(shown >= 1)) throw new Error(`«Juego» muestra ${shown} tarjetas y se esperaba al menos 1`)
  const notes = await step(page, `ver el rótulo «${NOT_EVIDENCE}»`, async () => {
    await page.getByText(NOT_EVIDENCE).first().waitFor()
    return page.getByText(NOT_EVIDENCE).count()
  })
  // Los datos guardados tienen la misma forma: si la API no contestó, el panel los muestra y este recorrido no probaría nada.
  if ((await page.getByText('Modo sin conexión (datos guardados):').count()) > 0)
    throw new Error('el panel mostró datos guardados en vez de los de la API')
  return `el panel muestra «Plan» con ${accepted} aceptada(s) (la API: ${plan.momentos.length} momento(s)), ${shown} tarjeta(s) del juego (la API: ${game.tarjetas}) y ${notes} rótulos «${NOT_EVIDENCE}»`
}

/** Un paso del recorrido: si falla, dice cuál era y qué mostraba la página. */
async function step(page, what, action) {
  try {
    return await action()
  } catch (error) {
    throw new Error(`no pude ${what}: ${error.message.split('\n')[0]}; ${await pageSays(page)}`, { cause: error })
  }
}

async function checkOffline(page) {
  try {
    await page.getByRole('heading', { name: OFFLINE_TITLE }).waitFor({ timeout: TIMEOUT_MS })
  } catch {
    throw new Error(`no apareció «${OFFLINE_TITLE}»: ${await pageSays(page)}`)
  }
  if ((await page.locator('.smart-bar').count()) > 0) throw new Error('la Home se montó sin API')
  return `la app muestra «${OFFLINE_TITLE}»`
}

const { values } = parseArgs({
  options: {
    app: { type: 'string' },
    shop: { type: 'boolean', default: false },
    kit: { type: 'boolean', default: false },
    game: { type: 'boolean', default: false },
    dato: { type: 'boolean', default: false },
    api: { type: 'string', default: API_DEFAULT },
    'user-file': { type: 'string' },
    'expect-offline': { type: 'boolean', default: false },
    panel: { type: 'string' },
  },
})
const offline = values['expect-offline']
const label = values.panel
  ? 'panel'
  : offline
    ? 'sin API'
    : values.kit
      ? 'kit de Mochi'
      : values.shop
        ? 'compra'
        : values.game
          ? 'juego'
          : values.dato
            ? 'dato'
            : 'en línea'

async function main() {
  if (!values.app && !values.panel) throw new Error('falta --app <url> (por ejemplo --app http://localhost:5184)')
  const browser = await chromium.launch({ channel: 'chrome' }).catch((error) => {
    throw new Error(`no pude abrir Chrome (${error.message.split('\n')[0]})`)
  })
  try {
    const page = await browser.newPage({
      viewport: values.panel ? { width: 1280, height: 900 } : { width: 560, height: 960 },
    })
    page.setDefaultTimeout(TIMEOUT_MS)
    const problems = watchProblems(page)
    if (!values.panel) await page.goto(values.app, { timeout: TIMEOUT_MS })
    const checks = {
      kit: checkKit,
      shop: checkShop,
      game: (p) => checkGame(p, values.api, values['user-file']),
      dato: checkDato,
    }
    const picked = Object.keys(checks).find((name) => values[name])
    const check = values.panel
      ? (p) => checkPanel(p, values.panel, values.api)
      : offline
        ? checkOffline
        : (checks[picked] ?? checkOnline)
    const done = await check(page)
    // Sin API es lo esperado que fallen sus llamadas: ahí no se miran.
    if (!offline && problems.length > 0) throw new Error(`fallos en la página o en la API: ${problems[0]}`)
    console.log(`  ✓ ${label}: ${done}`)
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(`  ✗ ${label}: ${(error.message ?? String(error)).split('\n')[0]}`)
  process.exitCode = 1
})
