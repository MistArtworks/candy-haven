import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode
} from 'react'
import { RECENT_MENU_SIZE, type RecentSet } from '@shared/domain/recent'
import { Portal } from '@renderer/components/primitives/Portal'
import { notify } from '@renderer/components/feedback/notify'
import { useNow } from '@renderer/hooks/useLeads'
import { useOpenRecentSet, usePrefetchRecentSets, useRecentSets } from '@renderer/hooks/useRecent'
import { ArchiveGlyph } from '../icons/ArchiveGlyph'
import { RecentList } from './RecentList'
import styles from './RecentMenu.module.scss'

/** Hover this long before it opens, so passing over it doesn't. */
const OPEN_DELAY_MS = 160
/** And this long away before it closes, so crossing the gap doesn't. */
const CLOSE_DELAY_MS = 320

export interface RecentMenuProps {
  onDossier: (projectId: string) => void
  /** The RECENT lens: every recent project, in the register's views. */
  onSeeAll: () => void
}

/**
 * RECENT, in ARCHIVE's masthead: the last twenty sets, like Live's own File →
 * Open Recent Set, dropping down when the pointer rests on it.
 *
 * Asked for by Candy on DISPATCH ("Recent projects option"). It opens on
 * hover as Live's does, and on a press or ↓ for the keyboard; it closes when
 * the pointer has been away a moment, on Esc, or on a press elsewhere. A set
 * opens in Live; one in the register also offers its dossier. The whole list
 * is the RECENT lens, at its foot.
 */
export function RecentMenu({ onDossier, onSeeAll }: RecentMenuProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [byKeyboard, setByKeyboard] = useState(false)
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const panel = useRef<HTMLDivElement | null>(null)
  const timer = useRef<number | null>(null)
  const recent = useRecentSets(open)
  const prefetch = usePrefetchRecentSets()
  const openSet = useOpenRecentSet()
  const now = useNow(60_000)

  const cancel = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }
  const later = (run: () => void, ms: number): void => {
    cancel()
    timer.current = window.setTimeout(run, ms)
  }
  useEffect(() => {
    const pending = timer
    return () => {
      if (pending.current !== null) window.clearTimeout(pending.current)
    }
  }, [])

  // Under the trigger, right edges aligned: it sits at the masthead's end.
  useLayoutEffect(() => {
    if (!open || !trigger.current) return
    const rect = trigger.current.getBoundingClientRect()
    setPosition({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (): void => setOpen(false)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    const onDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (panel.current?.contains(target) || trigger.current?.contains(target)) return
      setOpen(false)
    }
    // Anything scrolling but its own list.
    const onScroll = (event: Event): void => {
      const target = event.target
      if (target instanceof Node && panel.current?.contains(target)) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const choose = (set: RecentSet): void => {
    setOpen(false)
    openSet(set)
      .then(() => notify.done(`Opening ${set.name} in Live`))
      .catch((cause: unknown) => notify.refuse(cause, { label: 'Could not open it' }))
  }

  /** The menu's rows: the sets that can be opened, then All recent projects. */
  const rows = (): HTMLButtonElement[] => [
    ...(panel.current?.querySelectorAll<HTMLButtonElement>('[data-row]:not(:disabled)') ?? [])
  ]

  // ↑ and ↓ walk the rows, as a menu's do; a set's Dossier is a Tab away.
  const onPanelKey = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // From a set's Dossier, as from the set itself.
    const from = focused?.closest('li')?.querySelector<HTMLButtonElement>('[data-row]') ?? focused
    const list = rows()
    const at = list.indexOf(from as HTMLButtonElement)
    const next = list[at + (event.key === 'ArrowDown' ? 1 : -1)]
    if (!next) return
    event.preventDefault()
    next.focus()
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        data-open={open || undefined}
        onMouseEnter={() => {
          if (!open) prefetch()
          later(() => setOpen(true), open ? 0 : OPEN_DELAY_MS)
        }}
        onMouseLeave={() => later(() => setOpen(false), CLOSE_DELAY_MS)}
        onClick={() => {
          cancel()
          setByKeyboard(false)
          setOpen((current) => !current)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return
          event.preventDefault()
          // Already down (the pointer opened it): into it, on the first set.
          if (open) {
            rows()[0]?.focus()
            return
          }
          setByKeyboard(true)
          setOpen(true)
        }}
      >
        <ArchiveGlyph name="history" className={styles.glyph} />
        Recent
        <svg className={styles.chevron} viewBox="0 0 12 12" width="9" height="9" aria-hidden="true">
          <path
            d="M3.4 4.6 6 7.2 8.6 4.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="square"
          />
        </svg>
      </button>

      {open && position ? (
        <Portal>
          <div
            ref={panel}
            className={styles.panel}
            style={{ top: position.top, right: position.right }}
            role="menu"
            aria-label="Recent sets"
            onMouseEnter={cancel}
            onMouseLeave={() => later(() => setOpen(false), CLOSE_DELAY_MS)}
            onKeyDown={onPanelKey}
          >
            <div className={styles.head}>
              <span className={styles.title}>Recent sets</span>
              <span className={styles.sub}>Opened in Live or from here, newest first</span>
            </div>
            <div className={styles.scroll}>
              <RecentList
                sets={recent.data ?? []}
                loading={recent.isLoading}
                limit={RECENT_MENU_SIZE}
                now={now}
                onOpen={choose}
                onDossier={(id) => {
                  setOpen(false)
                  onDossier(id)
                }}
                autoFocus={byKeyboard}
              />
            </div>
            <button
              type="button"
              className={styles.all}
              data-row
              onClick={() => {
                setOpen(false)
                onSeeAll()
              }}
            >
              All recent projects
            </button>
          </div>
        </Portal>
      ) : null}
    </>
  )
}
