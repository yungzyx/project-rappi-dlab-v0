import { afterEach, describe, expect, test, vi } from 'vitest'

afterEach(() => vi.unstubAllGlobals())

describe('reloadToHome', () => {
  test('lleva la dirección a #/home y recarga, en ese orden', async () => {
    const { reloadToHome } = await vi.importActual('./reloadApp.js')
    const calls = []
    vi.stubGlobal('location', {
      pathname: '/app/',
      search: '?x=1',
      replace: (url) => calls.push(['replace', url]),
      reload: () => calls.push(['reload']),
    })
    reloadToHome()
    expect(calls).toEqual([['replace', '/app/?x=1#/home'], ['reload']])
  })
})
