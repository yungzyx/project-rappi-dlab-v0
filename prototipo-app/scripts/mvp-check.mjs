// Revisa en un Chrome real que la app del MVP responda como debe (lo corre scripts/mvp-check.sh con `make mvp-check`).
// Uso: node scripts/mvp-check.mjs --app http://localhost:5184 [--expect-offline]
//   sin --expect-offline: la app abre en la Home conectada, con la barra «Busca o pídele ideas a Mochi»;
//   con --expect-offline: la API está detenida y la app muestra «Sin conexión con Mochi».
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
  options: { app: { type: 'string' }, 'expect-offline': { type: 'boolean', default: false } },
})
const offline = values['expect-offline']
const label = offline ? 'sin API' : 'en línea'

async function main() {
  if (!values.app) throw new Error('falta --app <url> (por ejemplo --app http://localhost:5184)')
  const browser = await chromium.launch({ channel: 'chrome' }).catch((error) => {
    throw new Error(`no pude abrir Chrome (${error.message.split('\n')[0]})`)
  })
  try {
    const page = await browser.newPage({ viewport: { width: 560, height: 960 } })
    await page.goto(values.app, { timeout: TIMEOUT_MS })
    const done = offline ? await checkOffline(page) : await checkOnline(page)
    console.log(`  ✓ ${label}: ${done}`)
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(`  ✗ ${label}: ${(error.message ?? String(error)).split('\n')[0]}`)
  process.exitCode = 1
})
