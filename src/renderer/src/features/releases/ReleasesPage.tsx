import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { stagedCount, type ReleasesState } from '@shared/domain/releases'
import {
  STAGE_ACTIONS,
  STAGE_ACTION_LABEL,
  isToSend,
  type StageAction
} from '@shared/domain/releases.constants'
import { getSection } from '@shared/domain/navigation'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { CheckForNew, WebsiteGate, WebsiteStatus } from '@renderer/components/website/WebsiteChrome'
import { isSignedIn } from '@renderer/components/website/link'
import { MenuItem, MenuSurface } from '@renderer/features/archive/components/menu/MenuSurface'
import { gridVariants } from '@renderer/motion/transitions'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import { useReleases, useReleasesActions } from '@renderer/hooks/useReleases'
import { ActivityStrip } from './components/ActivityStrip'
import { PublishEverything } from './components/PublishEverything'
import { ReleaseRow } from './components/ReleaseRow'
import { ShelfPanel } from './components/ShelfPanel'
import { rowsOf, type Row } from './lib/present'
import styles from './ReleasesPage.module.scss'

/** The list's lenses: everything, what visitors see, what they don't, and what's left to send. */
const FILTERS = [
  { value: 'all', label: 'ALL' },
  { value: 'shown', label: 'SHOWN' },
  { value: 'hidden', label: 'HIDDEN' },
  { value: 'to-send', label: 'TO SEND' }
] as const
type Filter = (typeof FILTERS)[number]['value']

const toSend = (row: Row): boolean => row.send !== null && isToSend(row.send)

function matches(row: Row, filter: Filter): boolean {
  switch (filter) {
    case 'shown':
      return row.now.visible === true
    case 'hidden':
      return row.now.visible !== true
    case 'to-send':
      return toSend(row)
    default:
      return true
  }
}

/**
 * RELEASES: DISCOGRAPHY, as the website shows it.
 *
 * Until "Publish everything", the website shows its own releases, and this
 * page offers to switch it over. After that it lists every release here
 * with where it stands. Releases are picked, and what's done to them (Show,
 * Hide, the shelf, Send) is held until Update sends it all in one request.
 * An edit in DISCOGRAPHY still goes on its own when its sheet is done with.
 */
export function ReleasesPage(): ReactNode {
  const section = getSection('releases')
  const state = useReleases()
  const actions = useReleasesActions()
  const open = isSignedIn(state.link)
  const [filter, setFilter] = useState<Filter>('all')
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set())

  // What the website has is fetched once on opening, while someone's
  // signed in. After that, Check for new.
  const { sync } = actions
  const fetched = useRef(false)
  useEffect(() => {
    if (!open || fetched.current) return
    fetched.current = true
    void sync()
  }, [open, sync])

  const live = state.site?.live === true
  const rows = useMemo(() => rowsOf(state), [state])
  const counts = useMemo(() => {
    const out: Record<Filter, number> = { all: 0, shown: 0, hidden: 0, 'to-send': 0 }
    for (const row of rows.own) {
      for (const { value } of FILTERS) if (matches(row, value)) out[value] += 1
    }
    return out
  }, [rows.own])
  const visible = rows.own.filter((row) => matches(row, filter))
  const waiting = counts['to-send'] + state.pending

  // Picks that left the list (removed, or sent from elsewhere) are let go.
  const keys = useMemo(() => new Set([...rows.own, ...rows.remote].map((row) => row.key)), [rows])
  const pickedNow = useMemo(
    () => new Set([...picked].filter((key) => keys.has(key))),
    [picked, keys]
  )

  const toggle = useCallback((key: string) => {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const apply = useCallback(
    async (action: StageAction, ids: string[]) => {
      if (!ids.length) return
      const ok = await actions.stage(action, ids)
      if (ok && ids.length > 1) setPicked(new Set())
    },
    [actions]
  )

  return (
    <div className={styles.page}>
      <PageHeader
        index={section.order + 1}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
        guideId="releases"
        actions={<WebsiteStatus link={state.link} />}
      />

      <WebsiteGate link={state.link} what="RELEASES">
        The releases go to the website as the same two accounts that use the board, and the whole
        department stays behind that sign-in. Signing in here signs in there too; until then nothing
        is fetched or sent.
      </WebsiteGate>

      {open ? (
        <div className={styles.toolbar}>
          {live ? (
            <div className={styles.filters} role="group" aria-label="Show">
              {FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={styles.filter}
                  data-selected={filter === option.value || undefined}
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                  <span className={styles.filterCount}>{counts[option.value]}</span>
                </button>
              ))}
            </div>
          ) : (
            <span />
          )}
          <div className={styles.toolbarEnd}>
            {live ? (
              <span
                {...tooltipTrigger('Sends every release that is new, changed or waiting, together')}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  busy={actions.pending === 'sync-now'}
                  onClick={() => void actions.syncNow()}
                >
                  {waiting ? `Sync now · ${waiting}` : 'Sync now'}
                </Button>
              </span>
            ) : null}
            <CheckForNew
              link={state.link}
              syncing={actions.pending === 'sync'}
              onSync={() => void actions.sync()}
            />
          </div>
        </div>
      ) : null}

      {open ? <ActivityStrip state={state} /> : null}

      {open && !live ? (
        <PublishEverything
          state={state}
          busy={actions.pending === 'publish-everything'}
          onPublish={() => void actions.publishEverything()}
        />
      ) : null}

      {open && live ? (
        <motion.div
          className={styles.grid}
          variants={gridVariants}
          initial="initial"
          animate="animate"
        >
          <ShelfPanel state={state} actions={actions} />

          <Panel
            label="Releases"
            index="02"
            className={styles.listPanel}
            aside={`${state.entries.length} in DISCOGRAPHY`}
          >
            <PickBar
              rows={visible}
              picked={pickedNow}
              busy={actions.pending === 'stage'}
              onPickAll={(keys) => setPicked(new Set(keys))}
              onAction={(action) => void apply(action, [...pickedNow])}
            />
            {visible.length ? (
              <ul className={styles.list}>
                {visible.map((row) => (
                  <ReleaseRow
                    key={row.key}
                    row={row}
                    website={state.link.website}
                    picked={pickedNow.has(row.key)}
                    onPick={() => toggle(row.key)}
                    onAction={(action) => void apply(action, [row.key])}
                  />
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>
                {state.entries.length
                  ? 'Nothing here under this filter.'
                  : 'DISCOGRAPHY is empty. A release raised there shows here, and goes to the website when its sheet is done with.'}
              </p>
            )}
          </Panel>

          {rows.remote.length ? (
            <Panel
              label="From the other computer"
              index="03"
              className={styles.listPanel}
              aside={`${rows.remote.length} on the website`}
            >
              <p className={styles.note}>
                On the website, but sent from the other copy of the console: its DISCOGRAPHY has
                them, this one doesn&apos;t. They can be shown, hidden and put on the shelf here;
                they&apos;re edited there.
              </p>
              <ul className={styles.list}>
                {rows.remote.map((row) => (
                  <ReleaseRow
                    key={row.key}
                    row={row}
                    website={state.link.website}
                    picked={pickedNow.has(row.key)}
                    onPick={() => toggle(row.key)}
                    onAction={(action) => void apply(action, [row.key])}
                  />
                ))}
              </ul>
            </Panel>
          ) : null}
        </motion.div>
      ) : null}

      <AnimatePresence>
        {open && live && stagedCount(state.staged) ? (
          <UpdateBar
            state={state}
            busy={actions.pending === 'update'}
            discarding={actions.pending === 'discard'}
            onDiscard={() => void actions.discard()}
            onUpdate={() => void actions.update()}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/**
 * Above the list: pick all, how many are picked, and what can be done to
 * them. The actions only hold; Update sends.
 */
function PickBar({
  rows,
  picked,
  busy,
  onPickAll,
  onAction
}: {
  rows: Row[]
  picked: ReadonlySet<string>
  busy: boolean
  onPickAll: (keys: string[]) => void
  onAction: (action: StageAction) => void
}): ReactNode {
  const [more, setMore] = useState<{ x: number; y: number } | null>(null)
  const all = rows.length > 0 && rows.every((row) => picked.has(row.key))
  const some = picked.size > 0
  const pickWhere = (test: (row: Row) => boolean): void => {
    setMore(null)
    onPickAll(rows.filter(test).map((row) => row.key))
  }

  return (
    <div className={styles.pickBar} data-active={some || undefined}>
      <input
        type="checkbox"
        className={styles.check}
        checked={all}
        ref={(input) => {
          if (input) input.indeterminate = some && !all
        }}
        onChange={() => onPickAll(all ? [] : rows.map((row) => row.key))}
        aria-label={all ? 'Pick none' : 'Pick every release shown'}
      />
      <span className={styles.pickCount}>
        {some ? `${picked.size} picked` : 'Pick releases to act on them together'}
      </span>
      <span className={styles.pickActions}>
        {STAGE_ACTIONS.map((action) => (
          <Button
            key={action}
            size="sm"
            variant="ghost"
            disabled={!some || busy}
            onClick={() => onAction(action)}
          >
            {STAGE_ACTION_LABEL[action]}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          aria-haspopup="menu"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            setMore({ x: rect.right - 220, y: rect.bottom + 4 })
          }}
        >
          More
        </Button>
      </span>
      {more ? (
        <MenuSurface x={more.x} y={more.y} onClose={() => setMore(null)}>
          <MenuItem label="Pick every release shown" onClick={() => pickWhere(() => true)} />
          <MenuItem
            label="Pick the drafts"
            onClick={() => pickWhere((row) => row.now.status === 'draft')}
          />
          <MenuItem
            label="Pick the hidden ones"
            onClick={() => pickWhere((row) => row.now.visible === false)}
          />
          <MenuItem label="Pick what's to send" onClick={() => pickWhere(toSend)} />
          <MenuItem label="Pick none" disabled={!some} onClick={() => pickWhere(() => false)} />
        </MenuSurface>
      ) : null}
    </div>
  )
}

/** Pops up while anything is held: what Update will send, and the two ways out. */
function UpdateBar({
  state,
  busy,
  discarding,
  onDiscard,
  onUpdate
}: {
  state: ReleasesState
  busy: boolean
  discarding: boolean
  onDiscard: () => void
  onUpdate: () => void
}): ReactNode {
  const { staged } = state
  const choices = Object.values(staged.visibility)
  const parts = [
    choices.filter((choice) => choice === 'show').length
      ? `Show ${choices.filter((choice) => choice === 'show').length}`
      : null,
    choices.filter((choice) => choice === 'hide').length
      ? `Hide ${choices.filter((choice) => choice === 'hide').length}`
      : null,
    staged.send.length ? `Send ${staged.send.length}` : null,
    staged.shelf ? 'Shelf' : null
  ].filter(Boolean)
  const count = stagedCount(staged)

  return (
    <motion.div
      className={styles.updateBar}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.18 }}
      role="region"
      aria-label="Changes to send"
    >
      <span className={styles.updateCount}>
        {count} change{count === 1 ? '' : 's'} to send
      </span>
      <span className={styles.updateParts}>{parts.join(' · ')}</span>
      <span className={styles.updateSpacer} />
      <Button size="sm" variant="ghost" busy={discarding} disabled={busy} onClick={onDiscard}>
        Discard
      </Button>
      <Button size="md" variant="primary" busy={busy} onClick={onUpdate}>
        Update
      </Button>
    </motion.div>
  )
}
