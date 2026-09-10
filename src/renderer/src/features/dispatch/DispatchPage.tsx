import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { DispatchItem } from '@shared/domain/dispatch'
import {
  DISPATCH_AREAS,
  DISPATCH_AREA_LABEL,
  DISPATCH_AUTHORS,
  DISPATCH_AUTHOR_LABEL,
  DISPATCH_BODY_MAX,
  DISPATCH_KINDS,
  DISPATCH_KIND_LABEL,
  DISPATCH_PRIORITIES,
  DISPATCH_PRIORITY_LABEL,
  DISPATCH_SORTS,
  DISPATCH_SORT_LABEL,
  DISPATCH_STATUSES,
  DISPATCH_STATUS_LABEL,
  DISPATCH_TITLE_MAX,
  type DispatchArea,
  type DispatchKind,
  type DispatchPriority,
  type DispatchSort,
  type DispatchStatus
} from '@shared/domain/dispatch.constants'
import { getSection } from '@shared/domain/navigation'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { StatusDot, type StatusTone } from '@renderer/components/primitives/StatusDot'
import { SelectInput, TextArea, TextInput } from '@renderer/components/primitives/Input'
import { gridVariants } from '@renderer/motion/transitions'
import { useHotkeys } from '@renderer/hotkeys/useHotkeys'
import type { Hotkey } from '@renderer/hotkeys/registry'
import {
  canAdjudicate,
  isUnseen,
  unreadCount,
  useDispatch,
  useDispatchActions,
  useDispatchSetup,
  useIdentity
} from '@renderer/hooks/useDispatch'
import { ItemCard } from './components/ItemCard'
import { Thread } from './components/Thread'
import { formatRelative } from './lib/present'
import styles from './DispatchPage.module.scss'

const LINK_TONE: Record<string, StatusTone> = {
  unconfigured: 'offline',
  connecting: 'pending',
  online: 'online',
  error: 'error'
}

/**
 * DISPATCH — the shared board.
 *
 * The only department whose record is not this machine's. Two people use Candy
 * Haven: candy asks for things, mist builds them, and until now the asking
 * happened somewhere else. An item is filed here, discussed, and then resolved
 * or denied with a reason — and both copies of the app see the same list within
 * a moment of each other, because the record lives in a database they share.
 *
 * There is no login and there will not be one. Identity is chosen on the page,
 * remembered per machine, and labels an item rather than authorising anything:
 * a password on a board two people share protects nothing and would be one more
 * thing to lose. The one rule that is enforced is that only mist rules on an
 * item, which is a division of labour rather than a permission.
 */
export function DispatchPage(): ReactNode {
  const section = getSection('dispatch')
  const state = useDispatch()
  const setup = useDispatchSetup(state.revision)
  const actions = useDispatchActions()
  const [identity, chooseIdentity] = useIdentity()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<DispatchStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<DispatchSort>('active')
  const [composing, setComposing] = useState(false)

  const adjudicator = canAdjudicate(identity)

  const items = useMemo(() => {
    const needle = search.trim().toLowerCase()

    const matched = state.items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (!needle) return true
      return item.title.toLowerCase().includes(needle) || item.body.toLowerCase().includes(needle)
    })

    return matched.sort(comparator(sort))
  }, [state.items, statusFilter, search, sort])

  const selected = useMemo(
    () => state.items.find((item) => item.id === selectedId) ?? null,
    [state.items, selectedId]
  )

  /*
   * Opening an item marks it read.
   *
   * Keyed on the id and the comment count rather than on the item, so a reply
   * that lands while the thread is *already open* is also marked — otherwise
   * closing it would leave a mark for something that was read as it arrived.
   */
  const commentCount = selected ? Object.keys(selected.comments).length : 0
  useEffect(() => {
    if (!selected || !identity) return
    void actions.markSeen(selected.id, identity)
    // `actions` is rebuilt whenever a request is in flight; depending on it
    // would re-mark on every keystroke of an unrelated action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, commentCount, identity])

  /** Items with something new on them, for the header count. */
  const waiting = useMemo(
    () =>
      state.items.filter((item) => unreadCount(item, identity) > 0 || isUnseen(item, identity))
        .length,
    [state.items, identity]
  )

  const pending = state.items.filter((item) => item.status === 'pending').length

  const hotkeys = useMemo<Hotkey[]>(
    () => [
      {
        chord: 'ctrl+n',
        label: 'File something',
        group: 'Dispatch',
        whileTyping: true,
        disabled: identity === null || state.link.state !== 'online',
        run: () => setComposing(true)
      },
      {
        chord: 'escape',
        label: 'Close the thread',
        group: 'Dispatch',
        disabled: !composing && selectedId === null,
        run: () => {
          if (composing) setComposing(false)
          else setSelectedId(null)
        }
      }
    ],
    [composing, identity, selectedId, state.link.state]
  )

  useHotkeys(hotkeys)

  return (
    <div className={styles.page}>
      <PageHeader
        index={section.order + 1}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
        actions={
          <div className={styles.headerActions}>
            {/*
              Identity leads the header rather than sitting in a settings panel.
              It is the one thing that has to be right before anything else on
              this page means what it says, and it is a per-machine choice that
              either of them may need to change on a shared desk.
            */}
            <div className={styles.identity} role="group" aria-label="Who you are">
              <span className={styles.identityLabel}>You are</span>
              {DISPATCH_AUTHORS.map((author) => (
                <button
                  key={author}
                  type="button"
                  className={styles.identityPick}
                  data-on={identity === author || undefined}
                  aria-pressed={identity === author}
                  onClick={() => chooseIdentity(author)}
                >
                  {DISPATCH_AUTHOR_LABEL[author]}
                </button>
              ))}
            </div>

            <StatusDot
              tone={LINK_TONE[state.link.state] ?? 'pending'}
              label={
                state.link.state === 'online'
                  ? `Attached${state.link.syncedAt ? ` · ${formatRelative(state.link.syncedAt)}` : ''}`
                  : state.link.message
              }
              pulse={state.link.state === 'connecting'}
            />
          </div>
        }
      />

      {actions.error ? (
        <div className={styles.notice} role="alert">
          <span>{actions.error}</span>
          <button type="button" className={styles.dismiss} onClick={actions.dismissError}>
            Dismiss
          </button>
        </div>
      ) : null}

      {identity === null ? (
        <div className={styles.notice}>
          <span>Choose whether you are MIST or CANDY before filing anything.</span>
        </div>
      ) : null}

      <motion.div
        className={styles.grid}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        <Panel
          label="The board"
          index="01"
          focal
          className={styles.boardPanel}
          aside={
            <span className={styles.boardCount}>
              {waiting > 0 ? <span className={styles.boardWaiting}>{waiting} new</span> : null}
              {pending} pending · {state.items.length} total
            </span>
          }
        >
          <div className={styles.controls}>
            <TextInput
              label="Search"
              value={search}
              onChange={setSearch}
              placeholder="Title or body"
              className={styles.searchField}
            />
            <SelectInput
              label="Status"
              value={statusFilter}
              options={[
                { value: 'all', label: 'ALL' },
                ...DISPATCH_STATUSES.map((status) => ({
                  value: status,
                  label: DISPATCH_STATUS_LABEL[status]
                }))
              ]}
              onChange={(value) => setStatusFilter(value as DispatchStatus | 'all')}
            />
            <SelectInput
              label="Sort"
              value={sort}
              options={DISPATCH_SORTS.map((entry) => ({
                value: entry,
                label: DISPATCH_SORT_LABEL[entry]
              }))}
              onChange={setSort}
            />
            <Button
              size="sm"
              variant="primary"
              disabled={identity === null || state.link.state !== 'online'}
              title={identity === null ? 'Choose who you are first' : 'File a new item'}
              onClick={() => setComposing(true)}
            >
              File
            </Button>
          </div>

          {composing ? (
            <Compose
              busy={actions.pending === 'file'}
              onCancel={() => setComposing(false)}
              onSubmit={(draft) => {
                if (!identity) return
                void actions.file({ ...draft, author: identity }).then(() => setComposing(false))
              }}
            />
          ) : null}

          {items.length === 0 ? (
            <p className={styles.empty}>
              {state.items.length === 0
                ? state.link.state === 'online'
                  ? 'Nothing filed yet.'
                  : 'The board is not attached, so there is nothing to show.'
                : 'Nothing matches those filters.'}
            </p>
          ) : (
            <ul className={styles.board}>
              {items.map((item) => (
                <li key={item.id}>
                  <ItemCard
                    item={item}
                    selected={item.id === selectedId}
                    unread={unreadCount(item, identity)}
                    unseen={isUnseen(item, identity)}
                    onOpen={() => setSelectedId(item.id === selectedId ? null : item.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          label={selected ? 'Item' : 'Nothing open'}
          index="02"
          className={styles.threadPanel}
          aside={
            selected ? (
              <button type="button" className={styles.dismiss} onClick={() => setSelectedId(null)}>
                Close
              </button>
            ) : null
          }
        >
          {selected ? (
            <Thread
              key={selected.id}
              item={selected}
              identity={identity}
              adjudicator={adjudicator}
              busy={actions.pending === 'comment' || actions.pending === 'rule'}
              onComment={(body) => {
                if (identity) void actions.comment({ itemId: selected.id, author: identity, body })
              }}
              onRule={(status, reason) =>
                void actions.rule({ itemId: selected.id, status, reason })
              }
              onWithdraw={() => {
                void actions.withdraw(selected.id).then(() => setSelectedId(null))
              }}
            />
          ) : (
            <p className={styles.empty}>Pick something from the board.</p>
          )}
        </Panel>

        <Panel
          label="Connection"
          index="03"
          className={styles.setupPanel}
          aside={
            <StatusDot
              tone={LINK_TONE[state.link.state] ?? 'pending'}
              label={setup.configured ? 'Configured' : 'Not configured'}
            />
          }
        >
          <Setup
            configured={setup.configured}
            projectId={setup.projectId}
            databaseUrl={setup.databaseUrl}
            configPath={setup.configPath}
            message={state.link.message}
            busy={actions.pending === 'configure'}
            onSubmit={(source) => void actions.configure(source)}
          />
        </Panel>
      </motion.div>
    </div>
  )
}

// ------------------------------------------------------------------ composing

interface ComposeDraft {
  title: string
  body: string
  kind: DispatchKind
  area: DispatchArea
  priority: DispatchPriority
}

/**
 * Filing something.
 *
 * Inline above the board rather than in a modal. The board is the context for
 * what is being filed — half of what stops a duplicate is seeing the list while
 * writing — and a modal would cover exactly that.
 */
function Compose({
  busy,
  onCancel,
  onSubmit
}: {
  busy: boolean
  onCancel: () => void
  onSubmit: (draft: ComposeDraft) => void
}): ReactNode {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [kind, setKind] = useState<DispatchKind>('idea')
  const [area, setArea] = useState<DispatchArea>('general')
  const [priority, setPriority] = useState<DispatchPriority>('normal')

  const canFile = title.trim().length > 0

  return (
    <div className={styles.compose}>
      <TextInput
        label="Title"
        value={title}
        onChange={setTitle}
        maxLength={DISPATCH_TITLE_MAX}
        placeholder="One line — what it is"
      />

      <div className={styles.composeRow}>
        <SelectInput
          label="Kind"
          value={kind}
          options={DISPATCH_KINDS.map((entry) => ({
            value: entry,
            label: DISPATCH_KIND_LABEL[entry]
          }))}
          onChange={setKind}
        />
        <SelectInput
          label="Area"
          value={area}
          options={DISPATCH_AREAS.map((entry) => ({
            value: entry,
            label: DISPATCH_AREA_LABEL[entry]
          }))}
          onChange={setArea}
        />
        <SelectInput
          label="Priority"
          value={priority}
          options={DISPATCH_PRIORITIES.map((entry) => ({
            value: entry,
            label: DISPATCH_PRIORITY_LABEL[entry]
          }))}
          onChange={setPriority}
        />
      </div>

      <TextArea
        label="Detail"
        value={body}
        onChange={setBody}
        rows={4}
        maxLength={DISPATCH_BODY_MAX}
        placeholder="What you want, and why. Optional."
      />

      <div className={styles.composeActions}>
        <Button size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!canFile}
          busy={busy}
          onClick={() => onSubmit({ title, body, kind, area, priority })}
        >
          File it
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------- setup

/**
 * Attaching the board to a database.
 *
 * Accepts the whole snippet the Firebase console shows — unquoted keys, single
 * quotes, `const` and all — because asking someone to convert that to JSON by
 * hand is asking them to make a typo. The parser only has to find the fields it
 * knows.
 */
function Setup({
  configured,
  projectId,
  databaseUrl,
  configPath,
  message,
  busy,
  onSubmit
}: {
  configured: boolean
  projectId: string | null
  databaseUrl: string | null
  configPath: string
  message: string
  busy: boolean
  onSubmit: (source: string) => void
}): ReactNode {
  const [source, setSource] = useState('')

  return (
    <div className={styles.setup}>
      {configured ? (
        <>
          <p className={styles.hint}>
            Attached to <strong>{projectId || 'a Firebase project'}</strong>. Both copies of the app
            read and write the same board, so an item filed on one shows up on the other within a
            moment.
          </p>
          {/*
            The address is shown rather than merely held, because it may have
            been *derived* rather than pasted — the console's snippet omits it —
            and a wrong region produces a board that silently never attaches.
            Seeing the address is how that gets diagnosed at a glance.
          */}
          <code className={styles.url}>{databaseUrl}</code>
          {message ? <p className={styles.hint}>{message}</p> : null}
        </>
      ) : (
        <p className={styles.hint}>
          Paste the Firebase config from the console — Project settings, your web app, the
          <code className={styles.inline}>firebaseConfig</code> block. The whole snippet is fine; it
          does not need converting. It is saved to{' '}
          <code className={styles.inline}>{configPath}</code>.
        </p>
      )}

      <TextArea
        label={configured ? 'Replace the config' : 'Firebase config'}
        value={source}
        onChange={setSource}
        rows={6}
        placeholder={'const firebaseConfig = {\n  apiKey: "…",\n  databaseURL: "…"\n};'}
        hint="Needs the databaseURL line — the board uses the Realtime Database."
      />

      <div className={styles.composeActions}>
        <Button
          size="sm"
          variant="primary"
          disabled={source.trim().length === 0}
          busy={busy}
          onClick={() => {
            onSubmit(source)
            setSource('')
          }}
        >
          Attach
        </Button>
      </div>

      <p className={styles.footnote}>
        A Firebase web config is not a secret — it ships inside every web app that uses one, and
        access is governed by the database rules rather than by hiding it. A database created in
        test mode does stop allowing access after thirty days, and the readout above will say so
        when that happens.
      </p>
    </div>
  )
}

/** Sort orders. `active` leads, because the question is what has moved. */
function comparator(sort: DispatchSort): (a: DispatchItem, b: DispatchItem) => number {
  switch (sort) {
    case 'newest':
      return (a, b) => b.createdAt - a.createdAt
    case 'oldest':
      return (a, b) => a.createdAt - b.createdAt
    case 'priority': {
      const rank: Record<DispatchPriority, number> = { high: 0, normal: 1, low: 2 }
      // Ties break on recency rather than arbitrarily, so the order is stable
      // between renders and between the two copies of the app.
      return (a, b) => rank[a.priority] - rank[b.priority] || b.updatedAt - a.updatedAt
    }
    default:
      return (a, b) => b.updatedAt - a.updatedAt
  }
}
