import { useState, type ReactNode } from 'react'
import type { ArtistRecord, ArtistRole } from '@shared/domain/artists'
import { ARTIST_ROLES, ARTIST_ROLE_CREDIT } from '@shared/domain/artists.constants'
import type { ReleaseCredit } from '@shared/domain/discography'
import { MAX_CREDITS, MAX_CREDIT_NOTE } from '@shared/domain/discography.constants'
import { Button } from '@renderer/components/primitives/Button'
import { useEchoedText } from '@renderer/hooks/useEchoedText'
import styles from '../DiscographyPage.module.scss'

export interface CreditRowsProps {
  credits: readonly ReleaseCredit[]
  roster: readonly ArtistRecord[]
  busy: boolean
  onChange: (credits: ReleaseCredit[]) => void
}

/**
 * The liner notes — who did the work, as against who it is billed to.
 *
 * ## Why a row per role and not a row per person
 *
 * A credit is read by role: `PRODUCED BY — Candy Heist, Nasko`. Storing it the
 * other way round, a role on each person, would draw that same fact as two
 * lines saying PRODUCED BY, which is not how a sleeve has ever been printed
 * and gets worse the more people are on a release.
 *
 * It also keeps the list short enough to scan. There are eight roles, so a
 * release can only ever have eight meaningful rows however many people it
 * credits — which is why `MAX_CREDITS` at sixteen is a ceiling on the document
 * rather than a limit anybody will meet.
 *
 * ## Why the roles are the artist roles
 *
 * `ARTIST_ROLE_CREDIT` is the same closed set the roster uses, said in the
 * voice a credit is written in. A free-text role field would produce `Vocals`,
 * `vocalist`, `Vocal` and `VOX` inside a month — the exact reason that set is
 * closed — and `other` plus the row's note carries anything genuinely
 * unlisted, like `additional production` or which instrument was played.
 *
 * Everything here is optional. Most singles carry no credits at all, and an
 * empty list is the honest record of that.
 */
export function CreditRows({ credits, roster, busy, onChange }: CreditRowsProps): ReactNode {
  /*
   * Which row is picking people, by id.
   *
   * One at a time. Every row opening its own roster at once would put the
   * whole roster on screen as many times as there are credits, and the tab
   * would be mostly names nobody is currently choosing between.
   */
  const [picking, setPicking] = useState<string | null>(null)

  if (roster.length === 0) {
    return (
      <p className={styles.hint}>
        Nobody on the roster yet. Add the people you work with in ARTISTS and they can be credited
        here.
      </p>
    )
  }

  const replace = (id: string, patch: Partial<ReleaseCredit>): void => {
    onChange(credits.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const add = (): void => {
    /*
     * The first role nothing is credited under yet.
     *
     * A new row defaulting to PRODUCED BY when that line already exists would
     * give the release two of them, and the operator's next action would be to
     * change one — so the row arrives on a role that is still free. Falls back
     * to `other` once all eight are used, which is the only honest answer left.
     */
    const used = new Set(credits.map((row) => row.role))
    const role = ARTIST_ROLES.find((entry) => !used.has(entry)) ?? 'other'

    const row: ReleaseCredit = {
      id: `credit-${Date.now()}-${credits.length}`,
      role,
      artistIds: [],
      note: ''
    }

    onChange([...credits, row])
    // Straight into the picker: a credit with a role and nobody under it says
    // nothing, and naming people is the only reason the row was added.
    setPicking(row.id)
  }

  return (
    <div className={styles.creditRows}>
      {credits.length === 0 ? (
        <p className={styles.hint}>
          No credits yet. Add a line for anyone who worked on this — produced by, vocals by, artwork
          by. All optional.
        </p>
      ) : null}

      {credits.map((row) => (
        <CreditRow
          key={row.id}
          row={row}
          roster={roster}
          busy={busy}
          picking={picking === row.id}
          onTogglePicking={() => setPicking(picking === row.id ? null : row.id)}
          onPatch={(patch) => replace(row.id, patch)}
          onDrop={() => {
            onChange(credits.filter((entry) => entry.id !== row.id))
            if (picking === row.id) setPicking(null)
          }}
        />
      ))}

      {credits.length < MAX_CREDITS ? (
        <Button size="sm" variant="ghost" disabled={busy} onClick={add}>
          Add a credit
        </Button>
      ) : (
        <p className={styles.hint}>
          That is {MAX_CREDITS} credit lines, which is the ceiling. There are only eight roles — a
          list this long is saying something twice.
        </p>
      )}
    </div>
  )
}

interface CreditRowProps {
  row: ReleaseCredit
  roster: readonly ArtistRecord[]
  busy: boolean
  picking: boolean
  onTogglePicking: () => void
  onPatch: (patch: Partial<ReleaseCredit>) => void
  onDrop: () => void
}

/**
 * One credit line.
 *
 * Its own component so the note can hold its own text while it is being typed.
 * Patching a credit replaces the release's **whole** credits array, so a note
 * bound straight to `onPatch` wrote the entire record on every keystroke — and
 * the response would then arrive carrying the text as it was a round trip ago
 * and write it back into the field, which is the dropped-keystroke bug
 * `useEchoedText` was built for. A hook cannot be called inside a `map`, so the
 * row had to become a component to get one.
 *
 * The role and the drop control write immediately, and should: they are single
 * decisions rather than text, and there is no burst to collapse.
 */
function CreditRow({
  row,
  roster,
  busy,
  picking,
  onTogglePicking,
  onPatch,
  onDrop
}: CreditRowProps): ReactNode {
  const [note, setNote] = useEchoedText(row.note, (value) => onPatch({ note: value }))

  const named = row.artistIds
    .map((id) => roster.find((artist) => artist.id === id)?.name)
    .filter((name): name is string => Boolean(name))

  return (
    <div className={styles.creditRow}>
      <div className={styles.creditHead}>
        <select
          className={styles.creditRole}
          value={row.role}
          aria-label="Credit role"
          disabled={busy}
          onChange={(event) => onPatch({ role: event.target.value as ArtistRole })}
        >
          {ARTIST_ROLES.map((role) => (
            <option key={role} value={role}>
              {ARTIST_ROLE_CREDIT[role]}
            </option>
          ))}
        </select>

        {/*
          The names, as a sentence rather than as chips.
          A credit line is prose on a sleeve, and drawing four stamped chips
          where `Candy Heist, Nasko` belongs made the tab read as a control
          panel rather than as a record.
        */}
        <button
          type="button"
          className={styles.creditNames}
          data-none={named.length === 0 || undefined}
          aria-expanded={picking}
          onClick={onTogglePicking}
        >
          {named.length > 0 ? named.join(', ') : 'Nobody yet — choose'}
        </button>

        <input
          className={styles.creditNote}
          value={note}
          maxLength={MAX_CREDIT_NOTE}
          placeholder="additional production, guitar…"
          aria-label="Credit note"
          onChange={(event) => setNote(event.target.value)}
        />

        <button
          type="button"
          className={styles.creditDrop}
          aria-label="Remove this credit"
          disabled={busy}
          onClick={onDrop}
        >
          ✕
        </button>
      </div>

      {picking ? (
        <div className={styles.chips}>
          {roster.map((artist) => {
            const on = row.artistIds.includes(artist.id)
            return (
              <button
                key={artist.id}
                type="button"
                className={styles.chip}
                data-on={on || undefined}
                aria-pressed={on}
                disabled={busy}
                onClick={() =>
                  onPatch({
                    artistIds: on
                      ? row.artistIds.filter((entry) => entry !== artist.id)
                      : [...row.artistIds, artist.id]
                  })
                }
              >
                {artist.name}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
