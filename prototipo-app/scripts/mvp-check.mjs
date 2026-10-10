// Revisa en un Chrome real que la app del MVP responda como debe (lo corre scripts/mvp-check.sh con `make mvp-check`).
// Uso: node scripts/mvp-check.mjs --app http://localhost:5184 [--shop | --expect-offline]
//   sin banderas: la app abre en la Home conectada, con la barra «Busca o pídele ideas a Mochi»;
//   con --shop: Home → vertical Grocery → primera tienda → agregar un producto → carrito → pagar, y la API recibe el
//     pedido (que después verifica scripts/mvp-check.sh en la base de prueba);
//   con --expect-offline: la API está detenida y la app muestra «Sin conexión con Mochi».
// Con la API en marcha (sin --expect-offline) también falla ante un error de la página o de la consola, o una respuesta
// 4xx/5xx, desde la primera carga; solo se ignoran las imágenes del catálogo de prueba, que no existen.
// Sale con 0 si la revisión pasa y con 1 si no. Usa el Chrome instalado (playwright-core, sin descargar navegadores).
import { parseArgs } from 'node:util'
import { chromium } from 'playwright-core'

const HOME_HINT = 'Busca o pídele ideas a Mochi'
const OFFLINE_TITLE = 'Sin conexión con Mochi'
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
    'expect-offline': { type: 'boolean', default: false },
  },
})
const offline = values['expect-offline']
const label = offline ? 'sin API' : values.shop ? 'compra' : 'en línea'

async function main() {
  if (!values.app) throw new Error('falta --app <url> (por ejemplo --app http://localhost:5184)')
  const browser = await chromium.launch({ channel: 'chrome' }).catch((error) => {
    throw new Error(`no pude abrir Chrome (${error.message.split('\n')[0]})`)
  })
  try {
    const page = await browser.newPage({ viewport: { width: 560, height: 960 } })
    page.setDefaultTimeout(TIMEOUT_MS)
    const problems = watchProblems(page)
    await page.goto(values.app, { timeout: TIMEOUT_MS })
    const check = offline ? checkOffline : values.shop ? checkShop : checkOnline
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
