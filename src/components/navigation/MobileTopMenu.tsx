import { useCallback, useEffect, useRef, useState } from "react"
import { Ellipsis } from "lucide-react"
import { NavLink } from "react-router-dom"
import styles from "./MobileTopMenu.module.css"

export function MobileTopMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const closeMenu = useCallback(() => {
    setIsOpen(false)
    triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    popoverRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        closeMenu()
      }
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (
        target instanceof Node &&
        !popoverRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        closeMenu()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("click", onClick)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("click", onClick)
    }
  }, [closeMenu, isOpen])

  return (
    <div className={styles.menuRoot}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="打开菜单"
        className={styles.trigger}
        onClick={() => setIsOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <Ellipsis aria-hidden="true" size={22} />
      </button>
      {isOpen ? (
        <div className={styles.popover} ref={popoverRef} role="menu" tabIndex={-1}>
          <NavLink className={styles.menuItem} onClick={closeMenu} role="menuitem" to="/settings">
            设置
          </NavLink>
        </div>
      ) : null}
    </div>
  )
}
