import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

// Todo el texto visible: sin rayas largas y sin invitar a comprar (la spec lo prohíbe).
function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return files(p)
    return /\.(jsx?|css)$/.test(name) && !/\.test\./.test(name) ? [p] : []
  })
}

test('ningún texto de la interfaz lleva rayas largas ni habla de pedir o comprar', () => {
  for (const p of files(join(import.meta.dirname, 'screens')).concat(files(join(import.meta.dirname, 'components')))) {
    const src = readFileSync(p, 'utf8')
    expect(src, p).not.toMatch(/[—–]/)
    // Invitaciones a pedir o comprar; «No hay compras» (Ajustes) aclara lo contrario y se permite.
    expect(src, p).not.toMatch(/\b(pide|pides|pídelo|compra ahora|cómpralo|agrega al carro|pedido)\b/i)
  }
})
