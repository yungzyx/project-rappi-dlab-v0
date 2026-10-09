import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import TrackingMap from './TrackingMap'

afterEach(cleanup)

test('Mochi va por la ruta como HTML dentro del mapa SVG (si no, el navegador no lo dibuja)', () => {
  const { container } = render(<TrackingMap progress={0.5} delivered={false} />)
  const mochi = container.querySelector('.tracking-rider .mochi')
  expect(mochi.namespaceURI).toBe('http://www.w3.org/1999/xhtml')
})
