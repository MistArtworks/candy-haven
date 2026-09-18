import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ReleaseDistribution } from '@shared/domain/discography'
import {
  DISTRIBUTION_PLATFORMS,
  DISTRIBUTION_PLATFORM_LABEL,
  MAX_DISTRIBUTION,
  distributionLabel,
  withoutStream,
  type DistributionPlatform
} from '@shared/domain/discography.constants'
import { MAX_LINK_LABEL, MAX_LINK_URL, checkLinkUrl } from '@shared/domain/artists.constants'
import { Button } from '@renderer/components/primitives/Button'
import styles from '../DiscographyPage.module.scss'

export interface DistributionEditorProps {
  entries: readonly ReleaseDistribution[]
  /**
   * Whether the record is out in the world.
   *
   * Taken from `status`, which is the operator's own statement, rather than
   * derived from the release date as well — two opinions about whether
   * something has come out could disagree, and the field is the one that is
   * actually written down.
   */
  out: boolean
  onChange: (entries: ReleaseDistribution[]) => void
}

interface DraftFieldProps {
  label: string
  value: string
  placeholder?: string
  /** Reads as the live field. Gold, and first in the reading order. */
  primary?: boolean
  maxLength?: number
  /** A reason to refuse the value, or null to accept it. */
  refuse?: (value: string) => string | null
  onCommit: (value: string) => void
  action?: ReactNode
}

/**
 * One address, committed when the operator leaves it.
 *
 * **Not on change, and that is the whole reason this exists.** A URL patched
 * per keystroke is one IPC write per character, and every one of those writes
 * but the last carries a half-typed address that `update` refuses — so typing
 * a Spotify link would throw about thirty times before it succeeded.
 * Committing on blur or Enter makes an edit one write of one finished value.
 *
 * An invalid address is **kept on screen and not committed**, with
 * `checkLinkUrl`'s own reason under it. Discarding what somebody just typed
 * because it was not finished would be worse than holding on to it.
 */
function DraftField({
  label,
  value,
  placeholder,
  primary = false,
  maxLength,
  refuse,
  onCommit,
  action
}: DraftFieldProps): ReactNode {
  const [draft, setDraft] = useState(value)
  const [reason, setReason] = useState<string | null>(null)
  /** True while the operator is in the field and owns what it says. */
  const held = useRef(false)

  /*
   * The committed value is adopted whenever it changes underneath — on the
   * echo after a write, and when the sheet is handed a different release.
   *
   * Guarded by focus, which is the same ownership rule `useEchoedText` was
   * written for after pushed state ate keystrokes: while somebody is typing
   * here the value arriving from outside is stale by definition, and writing
   * it in would undo the edit in progress.
   */
  useEffect(() => {
    if (held.current) return
    setDraft(value)
    setReason(null)
  }, [value])

  const commit = (): void => {
    const next = draft.trim()
    if (next === value) return

    const refusal = refuse?.(next) ?? null
    if (refusal) {
      setReason(refusal)
      return
    }

    setReason(null)
    onCommit(next)
  }

  return (
    <label className={styles.distField} data-primary={primary || undefined}>
      <span className={styles.distFieldLabel}>{label}</span>
      <input
        className={styles.distInput}
        value={draft}
        placeholder={placeholder}
        maxLength={maxLength}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => {
          held.current = true
        }}
        onBlur={() => {
          held.current = false
          commit()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
        }}
      />
      {action}
      {reason ? <span className={styles.distRefusal}>{reason}</span> : null}
    </label>
  )
}

/** Refuses an address the operating system would not open. Empty is fine. */
function refuseUrl(value: string): string | null {
  if (!value) return null
  const check = checkLinkUrl(value)
  return check.ok ? null : (check.reason ?? 'That address cannot be used.')
}

/**
 * The platforms a release goes out on, and the two addresses each one holds.
 *
 * ## Why this is not `LinkEditor`
 *
 * That component is a flat list of one-address rows whose URL is read-only
 * `code` — pasted once at the bottom and never edited. This is a **planned
 * set**: the platform comes first and is chosen from a menu, the addresses
 * arrive later, and a row with neither is the state the feature exists for.
 * Bending one component across both would leave it serving two layouts
 * through flags. `LinkEditor` keeps serving ARTISTS, where a social really is
 * exactly a platform and a URL.
 *
 * ## Both slots are always on screen
 *
 * Only the emphasis moves: before release PRE-SAVE reads live and STREAM sits
 * muted, and afterwards the reverse. Hiding either would be wrong in both
 * directions — a Beatport pre-order is a stream address that exists weeks
 * early, and a pre-save link is worth keeping as a record long after it stops
 * working.
 */
export function DistributionEditor({ entries, out, onChange }: DistributionEditorProps): ReactNode {
  const used = new Set(entries.map((entry) => entry.platform))
  // `other` is the escape hatch and the only entry that may repeat — a
  // pre-save gate, a smart link, a shop that is not on the list.
  const available = DISTRIBUTION_PLATFORMS.filter(
    (platform) => platform === 'other' || !used.has(platform)
  )
  const [pick, setPick] = useState<DistributionPlatform>('spotify')
  const full = entries.length >= MAX_DISTRIBUTION
  const missing = withoutStream(entries)

  // The menu only ever offers what is left, so a platform already on the list
  // cannot be added twice — and the selection follows it when the last
  // unused platform is taken.
  const choice = available.includes(pick) ? pick : (available[0] ?? 'other')

  const update = (id: string, patch: Partial<ReleaseDistribution>): void => {
    onChange(entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)))
  }

  const add = (): void => {
    if (full) return
    onChange([
      ...entries,
      {
        // Minted here, as `LinkEditor` mints its own: the row has to be
        // removable before any patch is sent.
        id: `dist-${Date.now()}-${entries.length}`,
        platform: choice,
        label: '',
        presaveUrl: '',
        streamUrl: ''
      }
    ])
    setPick(choice)
  }

  return (
    <div className={styles.dist}>
      {entries.length === 0 ? (
        <p className={styles.distEmpty}>NO PLATFORMS YET. ADD THE STORES THIS GOES OUT ON.</p>
      ) : null}

      {out && missing > 0 ? (
        <p className={styles.distNudge}>
          OUT, AND {missing} {missing === 1 ? 'PLATFORM HAS' : 'PLATFORMS HAVE'} NO STREAM LINK
          YET.
        </p>
      ) : null}

      {entries.length > 0 ? (
        <ul className={styles.distList}>
          {entries.map((entry) => (
            <li key={entry.id} className={styles.distRow}>
              <div className={styles.distHead}>
                <span className={styles.distPlatform}>{distributionLabel(entry)}</span>

                {/* A name, only where the platform cannot supply one — the same
                    rule `LinkEditor` applies, and for the same reason: asking
                    for it on every row is asking somebody to name Spotify. */}
                {entry.platform === 'other' ? (
                  <input
                    className={styles.distName}
                    value={entry.label}
                    placeholder="Name it"
                    aria-label="Platform name"
                    maxLength={MAX_LINK_LABEL}
                    onChange={(event) => update(entry.id, { label: event.target.value })}
                  />
                ) : null}

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onChange(entries.filter((row) => row.id !== entry.id))}
                >
                  Remove
                </Button>
              </div>

              <DraftField
                label="Pre-save"
                value={entry.presaveUrl}
                placeholder="https://"
                primary={!out}
                maxLength={MAX_LINK_URL}
                refuse={refuseUrl}
                onCommit={(presaveUrl) => update(entry.id, { presaveUrl })}
                action={
                  entry.presaveUrl ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void window.candy.shell.openExternal(entry.presaveUrl)}
                    >
                      Open
                    </Button>
                  ) : undefined
                }
              />

              <DraftField
                label="Stream"
                value={entry.streamUrl}
                placeholder="https://"
                primary={out}
                maxLength={MAX_LINK_URL}
                refuse={refuseUrl}
                onCommit={(streamUrl) => update(entry.id, { streamUrl })}
                action={
                  entry.streamUrl ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void window.candy.shell.openExternal(entry.streamUrl)}
                    >
                      Open
                    </Button>
                  ) : undefined
                }
              />
            </li>
          ))}
        </ul>
      ) : null}

      <div className={styles.distAdd}>
        <select
          className={styles.distPick}
          value={choice}
          aria-label="Platform to add"
          disabled={full}
          onChange={(event) => setPick(event.target.value as DistributionPlatform)}
        >
          {available.map((platform) => (
            <option key={platform} value={platform}>
              {DISTRIBUTION_PLATFORM_LABEL[platform]}
            </option>
          ))}
        </select>
        <Button size="sm" variant="ghost" disabled={full} onClick={add}>
          Add platform
        </Button>
        {full ? (
          <span className={styles.distCeiling}>That is the ceiling of {MAX_DISTRIBUTION}.</span>
        ) : null}
      </div>
    </div>
  )
}
