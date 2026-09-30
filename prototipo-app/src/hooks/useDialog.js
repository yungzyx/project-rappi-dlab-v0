import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled]):not([hidden]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Diálogo modal usable con teclado y VoiceOver (WCAG 2.1.2 y 2.4.3): al abrir, el foco entra (a `[data-autofocus]`
 * o al primer control); Escape cierra; Tab no sale del diálogo; al cerrar, el foco vuelve a quien lo abrió.
 */
export function useDialog(ref, open, onClose) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return undefined
    const opener = document.activeElement
    const root = ref.current
    const target = root?.querySelector('[data-autofocus]') ?? root?.querySelector(FOCUSABLE) ?? root
    target?.focus({ preventScroll: true })

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !root) return
      const items = [...root.querySelectorAll(FOCUSABLE)]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [open, ref])
}
