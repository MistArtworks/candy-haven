import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { RELEASE_KIND_LABEL, type ReleaseKind } from '@shared/domain/discography.constants'
import { anniversaryLabel, type CalendarAnniversary } from '../anniversaries'
import styles from '../CalendarPage.module.scss'

export interface AnniversaryMarkProps {
  anniversary: CalendarAnniversary
  /** Drops nothing but shortens the count, for the month grid's narrow cells. */
  terse?: boolean
}

/**
 * The anniversary of a release, on the register.
 *
 * ## The same seal, made recessive
 *
 * Deliberately built from `ReleaseMark`'s own class rather than a second set
 * of parts: it is the same kind of object — a reading of a record that lives
 * in DISCOGRAPHY — and drawing it differently would imply it was something
 * else. What changes is emphasis. The seal is hollow rather than filled and
 * the title drops to secondary, so a day that carries a release *and* an
 * anniversary of an older one can never be misread as carrying two releases.
 *
 * Gold throughout, as `ReleaseMark` is. Crimson is live state and an
 * anniversary is the opposite of live — it is a date being remembered.
 *
 * Read-only and it leaves for the release, for the reason `ReleaseMark`
 * records at length: there is nothing here to open, and a marker that could
 * be dragged would make the calendar a second writer of a date the catalogue
 * owns. An anniversary is one step further from writable again — it is not
 * even stored anywhere to be written.
 */
export function AnniversaryMark({ anniversary, terse = false }: AnniversaryMarkProps): ReactNode {
  const navigate = useNavigate()
  const kind =
    RELEASE_KIND_LABEL[anniversary.kind as ReleaseKind] ?? anniversary.kind.toUpperCase()

  return (
    <button
      type="button"
      className={styles.releaseMark}
      data-anniversary=""
      title={`${anniversary.title} — ${kind}, out ${anniversary.years} ${
        anniversary.years === 1 ? 'year' : 'years'
      } ago today. Open in DISCOGRAPHY`}
      onClick={() => navigate(`/discography?release=${anniversary.releaseId}`)}
    >
      {/* Hollow, against the release mark's filled seal. The record went out
          on this day; it is not going out today. */}
      <span className={styles.releaseMarkSeal} aria-hidden="true">
        ◇
      </span>
      <span className={styles.releaseMarkTitle}>{anniversary.title}</span>
      <span className={styles.anniversaryYears}>{anniversaryLabel(anniversary.years, terse)}</span>
    </button>
  )
}
