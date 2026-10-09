// Genera las capturas de docs/screenshots recorriendo la app como un usuario (npm run screenshots).
// Usa el Chrome instalado (playwright-core, sin descargar navegadores) y un servidor Vite propio en el 5199.
// Los menús reales del scraper se apartan mientras corre: son datos scrapeados y no van al repo, ni en captura.
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = `${ROOT}docs/screenshots`
const MENUS = `${ROOT}src/data/generated/menus.json`
const MENUS_ASIDE = `${MENUS}.aparte`
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 5199
const BASE = `http://localhost:${PORT}/`

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function run(page) {
  // Espera a que carguen las imágenes visibles y a que terminen las transiciones de pantalla.
  // Las imágenes con loading="lazy" fuera de pantalla no cargan hasta hacer scroll: no se esperan.
  const settle = async (ms = 500) => {
    await page.evaluate(() =>
      Promise.all(
        [...document.images]
          .filter((img) => !img.complete && img.loading !== 'lazy')
          .map((img) => new Promise((done) => (img.onload = img.onerror = done))),
      ),
    )
    await wait(ms)
  }
  const shot = async (name, { full = false } = {}) => {
    await settle()
    // El interruptor de modo demo flota fuera del teléfono pero puede montarse sobre el marco: solo va en la portada.
    await page.evaluate((show) => {
      const toggle = document.querySelector('.demo-toggle')
      if (toggle) toggle.style.visibility = show ? '' : 'hidden'
    }, full)
    const target = full ? page : page.locator('.phone')
    await target.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 82 })
    console.log(`  ✓ ${name}`)
  }
  const tap = (selector, text) => page.locator(selector, text ? { hasText: text } : {}).first().click()
  const back = () => tap('[aria-label="Volver"]')
  const tab = (label) => tap('.bottom-nav-item', label)
  const shortcut = async (label) => {
    await page.locator('.home-shortcut', { hasText: label }).first().scrollIntoViewIfNeeded()
    await tap('.home-shortcut', label)
  }
  const center = (selector) => page.locator(selector).first().evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const reset = async () => {
    await page.evaluate(() => localStorage.clear())
    await page.goto(`${BASE}?r=${Date.now()}`)
    await page.waitForSelector('.home-shortcuts')
  }

  await page.goto(BASE)
  await reset()

  // --- Portada: modo demo y la Home en ambos modos (arranca en el prototipo final) ---
  await wait(4200) // Bigotes entra a los 0,9 s y termina de escribir su saludo
  await shot('00-modo-demo', { full: true })
  await shot('01-home-final')
  await page.keyboard.press('d')
  await shot('02-home-rappi-hoy')

  // --- Pantallas replicadas de Rappi (modo "Rappi hoy": sin agregados del prototipo final) ---
  for (const [name, open] of [
    ['10-restaurants', () => tap('.home-tile--restaurants')],
    ['11-turbo', () => tap('.home-tile--turbo')],
    ['15-grocery', () => shortcut('Grocery')],
    ['16-liquor', () => shortcut('Liquor')],
    ['17-rappitravel', () => shortcut('RappiTravel')],
  ]) {
    await open()
    await shot(name)
    await back()
    await settle(400)
  }
  for (const [name, label] of [
    ['12-deals', 'Offers'],
    ['13-favorites', 'Favorites'],
    ['14-account', 'Account'],
  ]) {
    await tab(label)
    await shot(name)
  }
  await tab('Home')
  await page.keyboard.press('d') // Rappi hoy → prototipo final
  await settle(400)

  // --- Lo nuevo del prototipo final ---
  await tap('.home-top .smart-bar') // la barra de la Home abre el buscador con Bigotes
  await wait(1200) // animación de entrada del panel
  await tap('.assistant-chip', 'carrete')
  await wait(3800) // Bigotes responde
  await shot('20-asistente')
  await tap('[role="dialog"] .search-back')
  await wait(600)

  await shortcut('Liquor')
  await settle()
  await center('.for-you')
  await shot('22-para-ti-vertical')
  await back()
  await settle(400)

  // Juego de verticales: se entra desde el pasaporte de la Home.
  await center('.live-passport')
  await tap('.live-passport-play')
  await wait(900)
  await tap('button', 'Ver el camino primero') // la bienvenida de Bigotes, la primera vez
  await settle(600)
  await shot('31-juego-camino')
  await tap('[aria-label="Volver a Rappi"]')
  await settle(400)

  await tab('Offers')
  await page.locator('.product-card', { hasText: 'Royal Guard' }).first().locator('.add-button').click()
  await wait(700)

  await tap('.cart-bar')
  await wait(500)
  await tap('.cart-checkout')
  await wait(800)
  await shot('25-checkout')
  await tap('.checkout-place')
  await wait(13000)
  await shot('26-seguimiento') // con «Juega mientras llega tu pedido»
  await tap('.tracking-game')
  await wait(1200)
  await shot('32-juego-espera')
  await wait(8000) // el pedido llega a mitad de ronda
  await tap('.game-order button', 'Ver pedido')
  await wait(800)
  await shot('27-entregado')
  await back()
  await settle(400)

  await tab('Account')
  await tap('.account-row', 'Loyalty')
  await wait(700)
  await tap('.loyalty-row')
  await wait(500)
  await tap('.loyalty-sheet-primary')
  await wait(900)
  await shot('28-loyalty-vinculado')

  // --- Ficha del personaje ---
  await page.setViewportSize({ width: 1100, height: 900 })
  await page.goto(`${BASE}design/bigotes.html`)
  await wait(1200)
  await shot('30-ficha-bigotes', { full: true })
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  if (existsSync(MENUS_ASIDE) && !existsSync(MENUS)) renameSync(MENUS_ASIDE, MENUS) // corrida anterior interrumpida
  const hadMenus = existsSync(MENUS)
  if (hadMenus) renameSync(MENUS, MENUS_ASIDE)

  const server = await createServer({ root: ROOT, server: { port: PORT, strictPort: true }, logLevel: 'error' })
  let browser
  try {
    await server.listen()
    browser = await chromium.launch({ executablePath: CHROME })
    const page = await browser.newPage({ viewport: { width: 560, height: 960 }, deviceScaleFactor: 2 })
    console.log(`Capturas en ${OUT}`)
    await run(page)
  } finally {
    await browser?.close()
    await server.close()
    if (hadMenus) renameSync(MENUS_ASIDE, MENUS)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
