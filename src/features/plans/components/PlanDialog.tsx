import { useEffect, useRef, type KeyboardEvent, type ReactNode, type SyntheticEvent } from "react"
import styles from "./PlanDialog.module.css"

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ")

function getFocusableElements(dialog: HTMLDialogElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => !element.hidden)
}

interface PlanDialogProps {
  children: ReactNode
  labelledBy: string
  onRequestClose: () => void
  open: boolean
  returnFocusTo?: HTMLElement | null
}

export function PlanDialog({ children, labelledBy, onRequestClose, open, returnFocusTo }: PlanDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open) {
      triggerRef.current = returnFocusTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
      if (!dialog.open) dialog.showModal()
      queueMicrotask(() => getFocusableElements(dialog)[0]?.focus())
      return
    }

    if (dialog.open) dialog.close()
    triggerRef.current?.focus()
  }, [open, returnFocusTo])

  function closeFromDialog(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault()
    onRequestClose()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault()
      onRequestClose()
      return
    }

    if (event.key !== "Tab") return

    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = getFocusableElements(dialog)
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <dialog
      aria-labelledby={labelledBy}
      className={styles.dialog}
      onCancel={closeFromDialog}
      onClose={() => { if (open) onRequestClose() }}
      onKeyDown={onKeyDown}
      ref={dialogRef}
    >
      {children}
    </dialog>
  )
}
