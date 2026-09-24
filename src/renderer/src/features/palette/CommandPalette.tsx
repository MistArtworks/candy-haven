import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, type Variants } from 'motion/react'
import { SECTIONS } from '@shared/domain/navigation'
import { Portal } from '@renderer/components/primitives/Portal'
import { SearchInput } from '@renderer/components/primitives/Input'
import { useBackdropDismiss } from '@renderer/hooks/useBackdropDismiss'
import { useHotkeys } from '@renderer/hotkeys/useHotkeys'
import type { Hotkey } from '@renderer/hotkeys/registry'
import { useProjectRegistry } from '@renderer/hooks/useProjects'
import { useDiscography } from '@renderer/hooks/useDiscography'
import { useArtists } from '@renderer/hooks/useArtists'
import { formatIndex } from '@renderer/lib/format'
import { EASE_OUT_EXPO, EASE_IN_EXPO, DURATION } from '@renderer/motion/transitions'
import { buildPaletteGroups, type PaletteResult } from './buildResults'
import styles from './CommandPalette.module.scss'

/** Settles typing before it drives a query — see `ArchivePage`'s own copy of this. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return settled
}

// The house curve, not a one-off: a row entering or leaving the list is the
// same "arrive, don't snap" grammar every other reveal in the console uses.
const rowVariants: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.fast, ease: EASE_OUT_EXPO } },
  exit: { opacity: 0, transition: { duration: DURATION.instant, ease: EASE_IN_EXPO } }
}

// Tight stagger, pressed often — the same trade `sheetTabVariants` makes over
// `gridVariants`: this list is re-read on nearly every keystroke, so it must
// not hold the operator up the way a once-per-visit page entrance can.
const listVariants: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.02 } },
  exit: {}
}

/**
 * The console-wide palette. Reachable from any department, any time, without
 * leaving whatever page it was summoned over — go to a department, open a
 * project's dossier, a release's sheet or an artist's card, or raise a
 * context-free record, all from one field.
 *
 * Answers nothing until asked: every group, pages included, is empty on an
 * empty query, so opening the palette shows the field alone rather than a
 * standing menu of everywhere the console goes.
 *
 * Mounted once, beside the console shell rather than inside it, so page
 * transitions never remount it and it is never subject to the containing
 * block a page's own motion leaves behind — see `Portal`.
 */
export function CommandPalette(): ReactNode {
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeRowRef = useRef<HTMLButtonElement>(null)

  const debouncedQuery = useDebounced(query, 180)

  // Not gated on `open`: `useProjectRegistry` has no `enabled` switch, the
  // same accommodation `DiscographyPage` already makes for it. Harmless here
  // too — an empty search still resolves, and the group it feeds stays empty
  // until the query is not.
  const projectRegistry = useProjectRegistry({ search: debouncedQuery.trim() })
  const discography = useDiscography(open)
  const artists = useArtists(open)

  const groups = useMemo(
    () =>
      buildPaletteGroups(
        {
          sections: SECTIONS,
          projects: projectRegistry.data?.projects ?? [],
          releases: discography.data?.releases ?? [],
          artists: artists.data ?? []
        },
        debouncedQuery
      ),
    [projectRegistry.data, discography.data, artists.data, debouncedQuery]
  )

  const flatResults = useMemo(() => groups.flatMap((group) => group.results), [groups])

  // A row's numeral is its position in the flattened list — the same number
  // Arrow keys are walking — computed once here rather than with a mutable
  // counter incremented while rendering each group's rows.
  const flatIndexById = useMemo(() => {
    const map = new Map<string, number>()
    flatResults.forEach((result, index) => map.set(result.id, index))
    return map
  }, [flatResults])

  /*
   * Two resets, both adjusted during render rather than in an effect — the
   * pattern React's own docs recommend for state that must reset in step
   * with something else changing, since it is folded into the render already
   * under way instead of costing a second one after commit.
   */

  // A fresh result list starts with the top row highlighted rather than
  // wherever the cursor happened to be left on the previous query.
  const [settledQuery, setSettledQuery] = useState(debouncedQuery)
  if (debouncedQuery !== settledQuery) {
    setSettledQuery(debouncedQuery)
    setActiveIndex(0)
  }

  // Closing (Escape, backdrop, re-toggling) always leaves the field blank
  // for next time, whichever of those closed it.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) {
      setQuery('')
      setActiveIndex(0)
    }
  }

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const select = useCallback(
    (result: PaletteResult) => {
      navigate(result.path)
      setOpen(false)
    },
    [navigate]
  )

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((index) => (flatResults.length ? (index + 1) % flatResults.length : 0))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((index) =>
          flatResults.length ? (index - 1 + flatResults.length) % flatResults.length : 0
        )
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const target = flatResults[activeIndex]
        if (target) select(target)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, flatResults, activeIndex, select])

  const hotkeys = useMemo<Hotkey[]>(
    () => [
      {
        chord: 'ctrl+space',
        label: 'Command palette',
        group: 'Global',
        whileTyping: true,
        run: () => setOpen((was) => !was)
      }
    ],
    []
  )

  useHotkeys(hotkeys)

  const dismiss = useBackdropDismiss(() => setOpen(false))

  const activeResult = flatResults[activeIndex] ?? null
  const asked = debouncedQuery.trim() !== ''

  if (!open) return null

  return (
    <Portal>
      <motion.div
        className={styles.layer}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.14 }}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        {...dismiss}
      >
        <motion.section
          className={styles.sheet}
          initial={{ opacity: 0, y: 10, scale: 0.99, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: DURATION.slow, ease: EASE_OUT_EXPO }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className={styles.head}>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Go anywhere"
              inputRef={inputRef}
            />

            {activeResult ? (
              <span className={styles.preview}>
                <span className={styles.previewArrow} aria-hidden="true">
                  →
                </span>
                {activeResult.title}
              </span>
            ) : null}

            <span className={styles.dismiss}>Esc</span>
          </div>

          {asked ? (
            <div className={styles.groups}>
              <AnimatePresence mode="popLayout">
                {groups.map((group) => (
                  <motion.section
                    key={group.id}
                    className={styles.group}
                    variants={listVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <h3 className={styles.groupTitle}>{group.label}</h3>

                    <ul className={styles.list}>
                      <AnimatePresence mode="popLayout" initial={false}>
                        {group.results.map((result) => {
                          const index = flatIndexById.get(result.id) ?? 0
                          const active = index === activeIndex

                          return (
                            <motion.li
                              key={result.id}
                              layout
                              className={styles.rowSlot}
                              variants={rowVariants}
                              initial="initial"
                              animate="animate"
                              exit="exit"
                            >
                              {active ? (
                                <motion.span
                                  layoutId="palette-marker"
                                  className={styles.marker}
                                  transition={{ duration: DURATION.base, ease: EASE_OUT_EXPO }}
                                />
                              ) : null}

                              <button
                                ref={active ? activeRowRef : undefined}
                                type="button"
                                className={styles.row}
                                data-active={active || undefined}
                                onMouseEnter={() => setActiveIndex(index)}
                                onClick={() => select(result)}
                              >
                                <span className={styles.mark}>{formatIndex(index + 1)}</span>

                                <span className={styles.body}>
                                  <span className={styles.title}>{result.title}</span>
                                  {result.subtitle ? (
                                    <span className={styles.subtitle}>{result.subtitle}</span>
                                  ) : null}
                                </span>

                                <span className={styles.verb}>{result.verb}</span>
                              </button>
                            </motion.li>
                          )
                        })}
                      </AnimatePresence>
                    </ul>
                  </motion.section>
                ))}
              </AnimatePresence>

              {groups.length === 0 ? <p className={styles.empty}>NOTHING ANSWERS.</p> : null}
            </div>
          ) : null}
        </motion.section>
      </motion.div>
    </Portal>
  )
}
