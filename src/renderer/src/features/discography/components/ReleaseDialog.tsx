import { useState, type ReactNode } from 'react'
import type { ArtistRecord } from '@shared/domain/artists'
import type {
  DiscographySummary,
  ReleaseDraft,
  ReleaseKind,
  ReleaseStatus
} from '@shared/domain/discography'
import {
  MAX_RELEASE_TITLE,
  RELEASE_KINDS,
  RELEASE_KIND_LABEL,
  RELEASE_KIND_PURPOSE,
  RELEASE_KIND_TRACK_HINT,
  RELEASE_STATUSES,
  RELEASE_STATUS_LABEL,
  RELEASE_STATUS_PURPOSE,
  maxTracksFor,
  seedsOneTrack
} from '@shared/domain/discography.constants'
import {
  Dialog,
  DialogChip,
  DialogChips,
  DialogField
} from '@renderer/components/primitives/Dialog'
import { DateInput, TextInput } from '@renderer/components/primitives/Input'
import styles from '../DiscographyPage.module.scss'

export interface ReleaseDialogProps {
  roster: readonly ArtistRecord[]
  /**
   * The catalogue, offered as the running order of anything that holds more
   * than one track. See `ReleaseDraft.collect`.
   */
  releases: readonly DiscographySummary[]
  busy: boolean
  error: string | null
  onSubmit: (draft: ReleaseDraft) => void
  onCancel: () => void
}

/**
 * Raise a release.
 *
 * **The title and the kind are required; nothing else is.** That split is not
 * arbitrary — they are the two facts that exist the moment an entry is worth
 * making. A label, a catalogue number, a UPC and a date all arrive later,
 * often months later and from somebody else, which is exactly why the sheet
 * writes every field the instant it changes rather than asking for a commit.
 *
 * The kind carries a default of `SINGLE` rather than starting unset, because
 * it is right most of the time and an unset required field is a dialog that
 * refuses to open having told you nothing.
 *
 * A date is offered but not demanded, and the status chips explain what the
 * difference costs: `RELEASED` is the one status that genuinely needs one,
 * and the service refuses it without — so this dialog refuses it here rather
 * than letting the operator find out after pressing Raise.
 */
export function ReleaseDialog({
  roster,
  releases,
  busy,
  error,
  onSubmit,
  onCancel
}: ReleaseDialogProps): ReactNode {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<ReleaseKind>('single')
  // Everything starts SCHEDULED now that the set is two — an entry exists
  // because something is meant to go out, and the empty date says when is not
  // fixed yet. This was `idea`, which no longer exists.
  const [status, setStatus] = useState<ReleaseStatus>('scheduled')
  const [releaseDate, setReleaseDate] = useState('')
  const [artistIds, setArtistIds] = useState<string[]>(
    // The operator's own record is billed by default, because almost every
    // entry is theirs. One press removes it for anything that is not.
    () => roster.filter((artist) => artist.isOperator).map((artist) => artist.id)
  )

  /*
   * The singles this record is made of, chosen as it is named.
   *
   * Held in order of choosing, which becomes the running order: an operator
   * ticking four singles is reading their album's sleeve, not a set. Cleared
   * when the kind changes to one that holds a single track, because a single
   * carrying somebody else's release would be a contradiction rather than a
   * mistake to warn about.
   */
  const [collect, setCollect] = useState<string[]>([])
  const collects = !seedsOneTrack(kind)
  const ceiling = maxTracksFor(kind)

  const needsDate = status === 'released' && !releaseDate
  const canConfirm = title.trim().length > 0 && !needsDate && !busy

  const submit = (): void => {
    if (!canConfirm) return
    onSubmit({
      title: title.trim(),
      kind,
      status,
      releaseDate: releaseDate || null,
      artistIds,
      collect: collects ? collect : []
    })
  }

  return (
    <Dialog
      title="Raise a release"
      width="wide"
      busy={busy}
      error={error}
      confirmLabel="Raise"
      canConfirm={canConfirm}
      onConfirm={submit}
      onCancel={onCancel}
      footnote={
        seedsOneTrack(kind)
          ? `A ${RELEASE_KIND_LABEL[kind].toLowerCase()} arrives with one track, taking the title. Artwork, label and the distribution codes are added on the sheet, which opens next.`
          : // Tracks are no longer only a later thing for these kinds: the
            // running order above takes the ones that already have records, and
            // the sheet takes the rest.
            'Anything not already in the catalogue — and the artwork, the label and the distribution codes — is added on the sheet, which opens next. It does not need a project in the ARCHIVE behind it.'
      }
    >
      <TextInput
        label="Title"
        value={title}
        onChange={setTitle}
        placeholder="Ossuary"
        maxLength={MAX_RELEASE_TITLE}
        hint="What it is called. Everything else can wait."
      />

      <DialogField label="Kind" required hint={RELEASE_KIND_TRACK_HINT[kind]}>
        <DialogChips>
          {RELEASE_KINDS.map((entry) => (
            <DialogChip
              key={entry}
              on={kind === entry}
              label={RELEASE_KIND_LABEL[entry]}
              title={RELEASE_KIND_PURPOSE[entry]}
              onClick={() => {
                setKind(entry)
                if (seedsOneTrack(entry)) setCollect([])
              }}
            />
          ))}
        </DialogChips>
      </DialogField>

      <DialogField label="Status" hint={RELEASE_STATUS_PURPOSE[status]}>
        <DialogChips>
          {RELEASE_STATUSES.map((entry) => (
            <DialogChip
              key={entry}
              on={status === entry}
              label={RELEASE_STATUS_LABEL[entry]}
              title={RELEASE_STATUS_PURPOSE[entry]}
              onClick={() => setStatus(entry)}
            />
          ))}
        </DialogChips>
      </DialogField>

      {/*
        The primitive, not the third raw date input this department had.

        Without a `DialogField` around it: that wrapper draws its own label and
        hint, and `DateInput` draws both itself, so nesting them says
        everything twice. What is lost is the wrapper's `required` marker — a
        release date is only required once the entry is RELEASED, and the hint
        below says exactly that, which is more than an asterisk manages.
      */}
      <DateInput
        label="Release date"
        value={releaseDate}
        onChange={setReleaseDate}
        invalid={needsDate}
        hint={
          needsDate
            ? 'A released entry needs the date it came out — the catalogue sorts by it.'
            : 'Optional until it is out.'
        }
      />

      {/*
        The running order, where it is already known.

        Only for the kinds that hold more than one track, and only when there
        is something to offer: a single has one row and it takes the title, so
        a picker there would be a control with nothing it could do. Ticking is
        the whole interaction — the search is there because a back catalogue
        is dozens of records, and the order is the order they were ticked in.
      */}
      {collects && releases.length > 0 ? (
        <DialogField
          label="Running order"
          hint={
            collect.length > 0
              ? `${collect.length} of ${ceiling} — in the order you ticked them. More can be added on the sheet.`
              : 'Tick the singles this is made of. Optional, and they can be added on the sheet instead.'
          }
        >
          <CatalogueTicks
            releases={releases}
            chosen={collect}
            ceiling={ceiling}
            onToggle={(id) =>
              setCollect((current) =>
                current.includes(id)
                  ? current.filter((entry) => entry !== id)
                  : current.length < ceiling
                    ? [...current, id]
                    : current
              )
            }
          />
        </DialogField>
      ) : null}

      {roster.length > 0 ? (
        <DialogField label="Billed as" hint="Who it is by. Features are added on the sheet.">
          <DialogChips>
            {roster.map((artist) => (
              <DialogChip
                key={artist.id}
                on={artistIds.includes(artist.id)}
                label={artist.name}
                onClick={() =>
                  setArtistIds((current) =>
                    current.includes(artist.id)
                      ? current.filter((entry) => entry !== artist.id)
                      : [...current, artist.id]
                  )
                }
              />
            ))}
          </DialogChips>
        </DialogField>
      ) : null}
    </Dialog>
  )
}

interface CatalogueTicksProps {
  releases: readonly DiscographySummary[]
  chosen: readonly string[]
  ceiling: number
  onToggle: (releaseId: string) => void
}

/**
 * The catalogue as a ticklist, with a search over it.
 *
 * Its own component rather than `DialogChips`, which is right for a closed set
 * of five kinds and wrong for a growing register: a chip row of forty releases
 * wraps into a wall, and none of those chips can say what kind of record it is
 * or when it came out — which is exactly what tells two similarly titled
 * entries apart.
 *
 * Ordered as the register hands them over, and the *choice* order is kept by
 * the caller: ticking four singles in running order should produce that running
 * order, not the catalogue's.
 */
function CatalogueTicks({ releases, chosen, ceiling, onToggle }: CatalogueTicksProps): ReactNode {
  const [search, setSearch] = useState('')

  const needle = search.trim().toLowerCase()
  const offered = needle
    ? releases.filter((release) => release.title.toLowerCase().includes(needle))
    : releases
  const full = chosen.length >= ceiling

  return (
    <div className={styles.ticks}>
      {releases.length > 6 ? (
        <input
          className={styles.tickSearch}
          value={search}
          aria-label="Search the catalogue"
          placeholder="Search the catalogue"
          onChange={(event) => setSearch(event.target.value)}
        />
      ) : null}

      {offered.length === 0 ? (
        <p className={styles.tickEmpty}>Nothing matches that.</p>
      ) : (
        <ul className={styles.tickList}>
          {offered.map((release) => {
            const on = chosen.includes(release.id)
            const position = chosen.indexOf(release.id) + 1

            return (
              <li key={release.id}>
                <button
                  type="button"
                  className={styles.tickRow}
                  data-on={on || undefined}
                  aria-pressed={on}
                  // A full running order refuses further ticks rather than
                  // silently dropping them; untick to swap one out.
                  disabled={!on && full}
                  onClick={() => onToggle(release.id)}
                >
                  <span className={styles.tickMark} aria-hidden="true">
                    {on ? String(position).padStart(2, '0') : '—'}
                  </span>
                  <span className={styles.tickTitle}>{release.title}</span>
                  <span className={styles.tickMeta}>
                    {RELEASE_KIND_LABEL[release.kind]}
                    {release.year ? ` · ${release.year}` : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
