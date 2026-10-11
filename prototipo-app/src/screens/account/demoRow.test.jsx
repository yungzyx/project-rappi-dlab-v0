import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ToastProvider } from '../../components/Toast'
import { gameReady, seed } from '../../game/testSeed.js'
import { AddressProvider } from '../../state/AddressContext'
import { DemoProvider } from '../../state/DemoContext'
import { GameProvider } from '../../state/GameContext'
import { OrdersProvider } from '../../state/OrdersContext'
import { ProfileProvider } from '../../state/ProfileContext'
import AccountScreen from './AccountScreen'

beforeEach(() => {
  localStorage.clear()
  seed()
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function renderAccount() {
  render(
    <DemoProvider>
      <ProfileProvider>
        <ToastProvider>
          <AddressProvider>
            <OrdersProvider>
              <GameProvider>
                <AccountScreen onBack={() => {}} push={() => {}} />
              </GameProvider>
            </OrdersProvider>
          </AddressProvider>
        </ToastProvider>
      </ProfileProvider>
    </DemoProvider>,
  )
  await gameReady()
}

describe('la fila «Modo demo» de Cuenta', () => {
  test('en desarrollo está', async () => {
    await renderAccount()
    expect(screen.getByRole('button', { name: /Modo demo/ })).toBeTruthy()
  })

  test('sin VITE_DEMO no está: el sitio desplegado no cambia de modo', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DEMO', '')
    await renderAccount()
    expect(screen.queryByRole('button', { name: /Modo demo/ })).toBeNull()
  })

  test('con VITE_DEMO=1 está aunque no sea desarrollo', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DEMO', '1')
    await renderAccount()
    expect(screen.getByRole('button', { name: /Modo demo/ })).toBeTruthy()
  })
})
