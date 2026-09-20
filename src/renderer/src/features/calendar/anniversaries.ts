import type { CalendarRelease } from '@shared/domain/calendar'
import { daysInMonth, parseIsoDate, toIsoDate } from '@shared/domain/calendar.constants'

/**
 * Anniversaries of a release, derived from the register's own projection.
 *
 * ## Nothing is stored, and nothing new crosses the bridge
 *
 * `CalendarState.releases` already carries every dated release, read afresh on
 * every build and held nowhere (D20). An anniversary is that same reading with
 * the year swapped for the year being drawn, so it needs no schema field, no
 * migration and no channel — which is the whole reason a projection was worth
 * having in the first place.
 *
 * Renderer-only, and deliberately not in `calendar.constants.ts`: that module
 * knows about dates and nothing about releases, and teaching it about one
 * would make the register's arithmetic depend on the catalogue's vocabulary.
 *
 * ## Released records only
 *
 * A scheduled entry has no anniversary — the day has not happened yet, and a
 * marker counting the years since a date in the future would be a countdown
 * wearing the wrong clothes. The original release date draws its own
 * `ReleaseMark`; this starts at **one year on** and never coincides with it.
 */
export interface CalendarAnniversary {
  releaseId: string
  title: string
  /** From `RELEASE_KINDS`; carried as a string, as `CalendarRelease` does. */
  kind: string
  /** Which one. Always at least 1 — the day itself is a release, not an anniversary. */
  years: number
  /** The day it falls on, in the year being drawn. */
  date: string
  /** The day the record actually went out. */
  releasedOn: string
}

/**
 * Every anniversary falling in `[from, to]`, inclusive of both ends.
 *
 * ### 29 February is skipped, not observed
 *
 * A record released on a leap day has an anniversary only in leap years. The
 * alternative is to observe it on the 28th or the 1st, which means inventing a
 * date the record was not released on and printing it in a register. Matching
 * the day exactly is the honest reading, and the marker returns in four years.
 */
export function anniversariesBetween(
  releases: readonly CalendarRelease[],
  from: string,
  to: string
): CalendarAnniversary[] {
  if (to < from) return []

  const firstYear = parseIsoDate(from).year
  const lastYear = parseIsoDate(to).year
  const found: CalendarAnniversary[] = []

  for (const release of releases) {
    if (release.status !== 'released') continue

    const { year: releasedYear, month, day } = parseIsoDate(release.date)

    for (let year = firstYear; year <= lastYear; year += 1) {
      // Strictly later, so the release date itself never draws twice.
      if (year <= releasedYear) continue
      // See the note above: a 29 February record has no 29th to fall on here.
      if (day > daysInMonth(year, month)) continue

      const date = toIsoDate(year, month, day)
      if (date < from || date > to) continue

      found.push({
        releaseId: release.releaseId,
        title: release.title,
        kind: release.kind,
        years: year - releasedYear,
        date,
        releasedOn: release.date
      })
    }
  }

  // The longest-standing record leads, then by title so the order is total and
  // a redraw cannot reshuffle two that fall on the same day.
  return found.sort((left, right) =>
    left.years !== right.years ? right.years - left.years : left.title.localeCompare(right.title)
  )
}

/** The anniversaries falling on one date. */
export function anniversariesOn(
  releases: readonly CalendarRelease[],
  date: string
): CalendarAnniversary[] {
  return anniversariesBetween(releases, date, date)
}

/**
 * `3 YEARS`, or `3Y` where the column is too narrow to say it.
 *
 * Plural handled rather than printed as `1 YEARS`, because the first
 * anniversary is the one most worth drawing and it would be the one that
 * read as a bug.
 */
export function anniversaryLabel(years: number, terse = false): string {
  if (terse) return `${years}Y`
  return `${years} ${years === 1 ? 'YEAR' : 'YEARS'}`
}
