import { StrictMode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { toMessage } from '../../api/client'
import { fixture, gameServer, stubApi } from '../../api/testing'
import { gameReady, savedAs, seed, stored } from '../../game/testSeed.js'
import { CartProvider } from '../../state/CartContext'
import { DemoProvider } from '../../state/DemoContext'
import { GameProvider } from '../../state/GameContext'
import { ProductSheetProvider } from '../../state/ProductSheetContext'
import { ProfileProvider } from '../../state/ProfileContext'
import AgentMessage from './AgentMessage'

const noop = () => {}

async function mount(response, { animate = false } = {}) {
  const message = { ...toMessage(response), animate }
  const result = render(
    <StrictMode>
      <DemoProvider>
        <ProfileProvider>
          <CartProvider>
            <GameProvider>
              <ProductSheetProvider>
                <AgentMessage message={message} onOpenProduct={noop} onOpenStore={noop} onAction={noop} onRetry={noop} />
              </ProductSheetProvider>
            </GameProvider>
          </CartProvider>
        </ProfileProvider>
      </DemoProvider>
    </StrictMode>,
  )
  await gameReady()
  return result
}

beforeEach(() => {
  seed()
  stubApi({})
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('«¿Sabías que…?»', () => {
  test('shows ¿Sabías que…? with title, text and source link', async () => {
    const { did_you_know: fact } = fixture('agent-ask-dato')
    await mount(fixture('agent-ask-dato'))
    expect(screen.getByText('¿Sabías que…?')).toBeTruthy()
    expect(screen.getByText(fact.title)).toBeTruthy()
    expect(screen.getByText(fact.text)).toBeTruthy()
    expect(screen.getByText(/Fuente:/).textContent).toContain(fact.source.title)
    const link = screen.getByRole('link', { name: fact.source.title })
    expect(link.getAttribute('href')).toBe(fact.source.url)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  test('showing the fact discovers the card once', async () => {
    await mount(fixture('agent-ask-dato'))
    await savedAs((state) => state?.discovered.restaurantes?.includes('restaurantes-01'))
    await new Promise((resolve) => setTimeout(resolve, 20)) // si hubiera una segunda llamada, su guardado ya habría salido
    const puts = gameServer.puts.filter((s) => s.discovered.restaurantes?.includes('restaurantes-01'))
    expect(puts).toHaveLength(1)
    expect(gameServer.state.cards).toContain('restaurantes-01')
    expect(gameServer.state.xp).toBe(10)
  })

  test('the fact comes after the product cards and is a quiet note, not a landmark', async () => {
    await mount(fixture('agent-ask-dato'))
    const products = document.querySelector('.agent-msg-products')
    const note = screen.getByRole('note')
    expect(products).not.toBeNull()
    expect(products.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(note.textContent).toContain('¿Sabías que…?')
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  test('a card already in the album is not discovered again', async () => {
    seed({ discovered: { restaurantes: ['restaurantes-01'] }, cards: ['restaurantes-01'] })
    await mount(fixture('agent-ask-dato'))
    expect(screen.getByText('¿Sabías que…?')).toBeTruthy()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(stored()).toBeNull()
  })

  test.each(['http://ich.unesco.org/x', 'javascript:alert(1)', 'ftp://x.org'])(
    'a source that is not https (%s) shows its title as plain text',
    async (url) => {
      const response = fixture('agent-ask-dato')
      response.did_you_know.source.url = url
      await mount(response)
      expect(screen.queryByRole('link')).toBeNull()
      expect(screen.getByText(/Fuente:/).textContent).toContain(response.did_you_know.source.title)
    },
  )

  test('no fact, no block', async () => {
    await mount(fixture('agent-ask'))
    expect(screen.queryByText('¿Sabías que…?')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(stored()).toBeNull()
  })
})

describe('reducir movimiento', () => {
  const matchMedia = (reduce) => (query) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    addEventListener() {},
    removeEventListener() {},
  })

  test('con reduce la respuesta aparece entera en el primer render', async () => {
    vi.stubGlobal('matchMedia', matchMedia(true))
    const response = fixture('agent-ask-dato')
    await mount(response, { animate: true })
    expect(screen.getByText(response.text)).toBeTruthy()
  })

  test('sin reduce la respuesta se escribe de a poco', async () => {
    vi.stubGlobal('matchMedia', matchMedia(false))
    const response = fixture('agent-ask-dato')
    await mount(response, { animate: true })
    expect(screen.queryByText(response.text)).toBeNull()
  })
})
