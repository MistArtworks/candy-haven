import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { displayOrder } from '@shared/domain/lore'
import type { LoreTab } from '@shared/domain/lore.constants'
import { getSection } from '@shared/domain/navigation'
import { useSystemStore } from '@renderer/app/store/system.store'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { CheckForNew, WebsiteGate, WebsiteStatus } from '@renderer/components/website/WebsiteChrome'
import { isSignedIn } from '@renderer/components/website/link'
import { useLore, useLoreActions } from '@renderer/hooks/useLore'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import { ChaptersTab } from './chapters/ChaptersTab'
import { WriteTab } from './chapters/WriteTab'
import { PlanetsTab } from './planets/PlanetsTab'
import styles from './Lore.module.scss'

const TABS: { value: LoreTab; label: string; hint: string }[] = [
  { value: 'chapters', label: 'CHAPTERS', hint: 'Every chapter, its order, and what is published' },
  { value: 'write', label: 'WRITE', hint: 'One chapter, with its preview' },
  { value: 'planets', label: 'PLANETS', hint: 'The planets the chapters are read beside' }
]

/**
 * LORE: the lore of Nayara, written here and published to the website.
 *
 * Written on this PC: the drafts, the planet library and the order are
 * kept in the archive here, and saving never touches the website. Only
 * Publish does, one chapter at a time. What the website has published is
 * fetched when the page opens and when asked, so a chapter the other
 * person published shows here too. Three tabs: the chapters' list, one
 * chapter being written, and the planets they're read beside. What's open
 * is kept in the address (`?tab=`, `?chapter=`, `?planet=`), as ARTISTS
 * keeps its open card; WRITE and CHAPTERS share the chapter.
 * See docs/LORE.md.
 */
export function LorePage(): ReactNode {
  const section = getSection('lore')
  const state = useLore()
  const actions = useLoreActions()
  const open = isSignedIn(state.link)

  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: LoreTab = tabParam === 'write' || tabParam === 'planets' ? tabParam : 'chapters'
  const chapterId = searchParams.get('chapter')
  const planetId = searchParams.get('planet')

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(patch)) {
            if (value) next.set(key, value)
            else next.delete(key)
          }
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  // Leaving something unsaved for another chapter, planet or tab is leaving
  // it as surely as leaving the page, so it's guarded the way the rail
  // guards the page: the unsaved-changes bar asks for a save or a discard.
  const guarded = useCallback((go: () => void) => {
    const { unsaved, nudgeUnsaved } = useSystemStore.getState()
    if (unsaved?.dirty) {
      nudgeUnsaved()
      return
    }
    go()
  }, [])

  // What's published is fetched once on opening, while someone's signed
  // in: the other person may have published since. After that, Check for new.
  const { sync } = actions
  const fetched = useRef(false)
  useEffect(() => {
    if (!open || fetched.current) return
    fetched.current = true
    void sync()
  }, [open, sync])

  const counts: Record<LoreTab, number> = {
    chapters: displayOrder(state).length,
    write: 0,
    planets: state.planets.length
  }

  return (
    <div className={styles.page}>
      <PageHeader
        index={section.order + 1}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
        guideId="lore"
        actions={<WebsiteStatus link={state.link} />}
      />

      <WebsiteGate link={state.link} what="LORE">
        The lore is published to the website as the same two accounts that use the board, and the
        whole department stays behind that sign-in. Signing in here signs in there too; until then
        nothing is fetched or shown.
      </WebsiteGate>

      {open ? (
        <div className={styles.toolbar}>
          <div className={styles.tabs} role="tablist" aria-label="LORE">
            {TABS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                className={styles.tab}
                aria-selected={tab === option.value}
                {...tooltipTrigger(option.hint)}
                onClick={() =>
                  guarded(() =>
                    setParams({ tab: option.value === 'chapters' ? null : option.value })
                  )
                }
              >
                {option.label}
                {option.value === 'write' ? null : (
                  <span className={styles.tabCount}>{counts[option.value]}</span>
                )}
              </button>
            ))}
          </div>
          <CheckForNew
            link={state.link}
            syncing={actions.pending === 'sync'}
            onSync={() => void actions.sync()}
          />
        </div>
      ) : null}

      {open && state.site && !state.site.live ? (
        <p className={styles.notice}>
          <span className={styles.noticeLabel}>Not live yet</span>
          The website still reads the lore from its own files. Drafts stay on this PC; the first
          chapter published from here switches the website over, and from then on it shows only
          what&apos;s published here.
        </p>
      ) : null}

      {open ? (
        tab === 'chapters' ? (
          <ChaptersTab
            state={state}
            selectedId={chapterId}
            onOpen={(id) => guarded(() => setParams({ chapter: id, tab: 'write' }))}
            onOpenPlanet={(id) => guarded(() => setParams({ planet: id, tab: 'planets' }))}
            actions={actions}
          />
        ) : tab === 'write' ? (
          <WriteTab
            state={state}
            chapterId={chapterId}
            onSelect={(id) => guarded(() => setParams({ chapter: id }))}
            onShowChapters={() => guarded(() => setParams({ tab: null }))}
            actions={actions}
          />
        ) : (
          <PlanetsTab
            state={state}
            selectedId={planetId}
            onSelect={(id) => guarded(() => setParams({ planet: id }))}
            actions={actions}
          />
        )
      ) : null}
    </div>
  )
}
