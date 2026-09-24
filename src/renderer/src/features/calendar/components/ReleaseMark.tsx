import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CalendarRelease } from '@shared/domain/calendar'
import { RELEASE_KIND_LABEL, type ReleaseKind } from '@shared/domain/discography.constants'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import styles from '../CalendarPage.module.scss'

export interface ReleaseMarkProps {
  release: CalendarRelease
  /** Drops the kind and status, for the month grid's narrow cells. */
  terse?: boolean
}

/**
 * A release date on the register.
 *
 * ## Not an entry, and drawn so you can tell
 *
 * Everything else on the calendar is a `CalendarEntry` — the operator's own
 * dated statement, which they wrote and can edit here. This is a *reading* of
 * a record that lives in DISCOGRAPHY, where the date is set and where it
 * stays, so it is deliberately a different object: no kind swatch, no done
 * toggle, no dialog. Pressing it leaves for the release instead.
 *
 * `calendar.ts` reserved exactly this: "a release date held on a release
 * record — belongs in a projection over this, not in this schema".
 *
 * ## Why it leaves rather than opening something here
 *
 * Because there is nothing here to open. A dialog over a projection would be a
 * form the operator could fill in and nothing would keep — and letting it be
 * dragged to another day would make the calendar a second writer of a date the
 * catalogue owns. The one honest action is to go to where the date lives.
 *
 * Addressed the same way the ARCHIVE's dossier addresses a release, so there
 * is one route into a record from anywhere in the console.
 */
export function ReleaseMark({ release, terse = false }: ReleaseMarkProps): ReactNode {
  const navigate = useNavigate()
  const kind = RELEASE_KIND_LABEL[release.kind as ReleaseKind] ?? release.kind.toUpperCase()

  return (
    <button
      type="button"
      className={styles.releaseMark}
      data-out={release.status === 'released' || undefined}
      {...tooltipTrigger(`${release.title} — ${kind}, open in DISCOGRAPHY`)}
      onClick={() => navigate(`/discography?release=${release.releaseId}`)}
    >
      {/*
        The seal, in gold. Crimson is reserved for live state and this is a
        date, not a thing happening now — even when the release is out.
      */}
      <span className={styles.releaseMarkSeal} aria-hidden="true">
        ◆
      </span>
      <span className={styles.releaseMarkTitle}>{release.title}</span>
      {terse ? null : <span className={styles.releaseMarkKind}>{kind}</span>}
    </button>
  )
}
