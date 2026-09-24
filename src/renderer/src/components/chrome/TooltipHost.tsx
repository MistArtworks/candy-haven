import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useTooltipStore } from '@renderer/app/store/tooltip.store'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import { Portal } from '@renderer/components/primitives/Portal'
import styles from './TooltipHost.module.scss'

/** Clearance between the trigger and the tip, and the tip and the window edge. */
const GAP = 6

interface Position {
  top: number
  left: number
  /** Placed below the trigger instead of above it — see the measuring effect. */
  flip: boolean
}

/**
 * The one hint on screen, wherever `useTooltip` last asked for one.
 *
 * Mounted once by `ConsoleLayout`, a sibling of the page the same way
 * `MiniPlayer`, `Toaster` and `Reticle` are: this is chrome, not a page's own
 * content, and a page carries a transform that would otherwise resolve this
 * component's `position: fixed` tip against the page rather than the window.
 * Portalled on top of that, for the same reason `Select`'s list is — see
 * `Portal`.
 */
export function TooltipHost(): ReactNode {
  const label = useTooltipStore((state) => state.label)
  const target = useTooltipStore((state) => state.target)
  const [position, setPosition] = useState<Position | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)
  const animating = useAnimationsEnabled()

  /*
   * Measured after layout, the same principle `usePanelAnchor` is built on:
   * whether the tip fits above depends on how tall it actually rendered, so
   * the position it settles into is computed one frame after the guess.
   *
   * Centred on the trigger and placed above it by default; flips below only
   * when there is genuinely less room above than the tip needs, and is
   * clamped to the window rather than left to run off either edge.
   */
  useLayoutEffect(() => {
    if (!target) return
    const tip = tipRef.current
    if (!tip) return

    const rect = target.getBoundingClientRect()
    const tipRect = tip.getBoundingClientRect()
    const roomAbove = rect.top - GAP
    const flip = roomAbove < tipRect.height

    setPosition({
      top: flip ? rect.bottom + GAP : rect.top - GAP - tipRect.height,
      left: clamp(
        rect.left + rect.width / 2 - tipRect.width / 2,
        GAP,
        window.innerWidth - tipRect.width - GAP
      ),
      flip
    })

    const dismiss = (): void => useTooltipStore.getState().hide()
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [target, label])

  const open = label !== null && target !== null

  return (
    <Portal>
      <AnimatePresence>
        {open ? (
          <motion.div
            ref={tipRef}
            role="tooltip"
            className={styles.tip}
            style={position ? { top: position.top, left: position.left } : { opacity: 0 }}
            initial={animating ? { opacity: 0, y: position?.flip ? -4 : 4 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={animating ? { opacity: 0 } : undefined}
            transition={{ duration: 0.12 }}
          >
            {label}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Portal>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
