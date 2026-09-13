import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from 'react'
import { Portal } from '@renderer/components/primitives/Portal'
import styles from '../stacks/stacks.module.scss'

export interface MenuSurfaceProps {
  /** Where the pointer was, in viewport coordinates. */
  x: number
  y: number
  children: ReactNode
  onClose: () => void
}

/**
 * The panel a right-click menu is drawn on: portalled, placed, and dismissed.
 *
 * Extracted from `ContextMenu` when the dossier grew a menu of its own for the
 * final mix and master. Everything here is the part neither menu has an opinion
 * about — where it sits and when it goes away — so keeping one copy means the
 * viewport clamp cannot be fixed in one menu and left wrong in the other.
 *
 * Portalled rather than rendered in place, and that is not optional: the page
 * wrapper animates, which makes it a containing block, so a `position: fixed`
 * menu inside one would be positioned against the page instead of the viewport.
 *
 * Built in the renderer rather than through Electron's `Menu.popup`, which the
 * app already installs for text fields. A native menu on Windows is drawn in
 * the system's own chrome — a plain grey rectangle in the middle of a page
 * whose entire premise is that it is a console from somewhere else. The
 * existing native handler bails out on targets that are neither editable nor
 * selected text, so it does not fight this.
 */
export function MenuSurface({ x, y, children, onClose }: MenuSurfaceProps): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x, y })

  // Dismiss on anything that is not a click inside the menu. `pointerdown`
  // rather than `click` so the menu is gone before whatever was underneath it
  // starts reacting.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onClose)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  // Nudge back inside the viewport when opened near an edge — measured after
  // layout, because the menu's height depends on what is in it.
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const { width, height } = element.getBoundingClientRect()
    setPosition({
      x: Math.min(x, window.innerWidth - width - 8),
      y: Math.min(y, window.innerHeight - height - 8)
    })
  }, [x, y])

  const style = { left: position.x, top: position.y } as CSSProperties

  return (
    <Portal>
      <div ref={ref} className={styles.menu} style={style} role="menu">
        {children}
      </div>
    </Portal>
  )
}

export interface MenuItemProps {
  label: string
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  /** Draws a colour chip on the trailing edge — used by the filing picker. */
  swatch?: string
}

export function MenuItem({ label, onClick, disabled, danger, swatch }: MenuItemProps): ReactNode {
  return (
    <button
      type="button"
      className={styles.menuItem}
      role="menuitem"
      disabled={disabled}
      data-danger={danger || undefined}
      style={swatch ? ({ '--folder-colour': swatch } as CSSProperties) : undefined}
      onClick={onClick}
    >
      <span>{label}</span>
      {swatch ? <span className={styles.menuSwatch} aria-hidden="true" /> : null}
    </button>
  )
}

/** The heading above a group of items. Names what is being acted on. */
export function MenuLabel({ children }: { children: ReactNode }): ReactNode {
  return <span className={styles.menuLabel}>{children}</span>
}

export function MenuDivider(): ReactNode {
  return <div className={styles.menuDivider} />
}
