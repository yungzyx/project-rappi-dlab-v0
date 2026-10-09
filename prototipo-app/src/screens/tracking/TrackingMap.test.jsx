import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import TrackingMap from './TrackingMap'

afterEach(cleanup)

const rider = (delivered) =>
  render(<TrackingMap progress={0.5} delivered={delivered} />).container.querySelector('.tracking-rider')

// Safari dibuja mal el HTML animado dentro de un foreignObject: en el mapa, Mochi es SVG puro.
test('Mochi va por la ruta dibujado en SVG, con su pose de la imagen de poses', () => {
  const el = rider(false)
  expect(el.querySelector('foreignObject')).toBeNull()
  const pose = el.querySelector('image')
  expect(pose.getAttribute('href')).toMatch(/mochi-poses/)
  expect(pose.getAttribute('x')).toBe('0') // frontal
})

test('al entregar, Mochi pone su pose feliz', () => {
  expect(rider(true).querySelector('image').getAttribute('x')).toBe('-1')
})
