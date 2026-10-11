import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { useDialog } from './useDialog'

afterEach(cleanup)

function Dialog({ name, onClose, children }) {
  const ref = useRef(null)
  useDialog(ref, true, onClose)
  return (
    <div ref={ref} role="dialog" aria-label={name} tabIndex={-1}>
      <button type="button">{name} uno</button>
      <button type="button">{name} dos</button>
      {children}
    </div>
  )
}

// Como el panel de Mochi con la hoja de producto encima: el foco entra a la hoja (abierta después).
function Stacked({ onClosePanel, onCloseSheet }) {
  const [sheet, setSheet] = useState(false)
  return (
    <>
      <Dialog name="panel" onClose={onClosePanel} />
      <button type="button" onClick={() => setSheet(true)}>
        abrir hoja
      </button>
      {sheet && (
        <Dialog
          name="hoja"
          onClose={() => {
            onCloseSheet()
            setSheet(false)
          }}
        />
      )}
    </>
  )
}

describe('useDialog con diálogos apilados', () => {
  test('con el panel y la hoja abiertos, Tab llega al segundo control de la hoja', () => {
    render(<Stacked onClosePanel={vi.fn()} onCloseSheet={vi.fn()} />)
    fireEvent.click(screen.getByText('abrir hoja'))
    const [first, second] = [screen.getByText('hoja uno'), screen.getByText('hoja dos')]
    expect(document.activeElement).toBe(first)
    // El navegador mueve el foco si nadie cancela el Tab; aquí se comprueba que nadie lo cancela ni lo saca de la hoja.
    expect(fireEvent.keyDown(first, { key: 'Tab' })).toBe(true)
    second.focus()
    expect(fireEvent.keyDown(second, { key: 'Tab' })).toBe(false) // el último vuelve al primero de la hoja
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(second)
  })

  test('Escape cierra solo el diálogo de arriba', () => {
    const onClosePanel = vi.fn()
    const onCloseSheet = vi.fn()
    render(<Stacked onClosePanel={onClosePanel} onCloseSheet={onCloseSheet} />)
    fireEvent.click(screen.getByText('abrir hoja'))
    fireEvent.keyDown(document.activeElement, { key: 'Escape' })
    expect(onCloseSheet).toHaveBeenCalledTimes(1)
    expect(onClosePanel).not.toHaveBeenCalled()
  })

  test('al cerrar la hoja, el foco vuelve a quien la abrió y el panel atiende Escape otra vez', () => {
    const onClosePanel = vi.fn()
    render(<Stacked onClosePanel={onClosePanel} onCloseSheet={vi.fn()} />)
    const opener = screen.getByText('abrir hoja')
    opener.focus()
    fireEvent.click(opener)
    fireEvent.keyDown(document.activeElement, { key: 'Escape' }) // cierra la hoja
    expect(screen.queryByRole('dialog', { name: 'hoja' })).toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(onClosePanel).not.toHaveBeenCalled()
    fireEvent.keyDown(document.activeElement, { key: 'Escape' })
    expect(onClosePanel).toHaveBeenCalledTimes(1)
  })
})
