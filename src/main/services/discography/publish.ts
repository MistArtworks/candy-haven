import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import {
  CANVAS_STEM,
  COVER_ART_STEM,
  DETAILS_FILE_NAME,
  ARTIST_ROLE_CREDIT_FALLBACK,
  releaseFolderName,
  trackFileName,
  trackFeatureIds
} from '@shared/domain/discography.constants'
import { ARTIST_ROLE_CREDIT } from '@shared/domain/artists.constants'
import type { DiscographyRelease } from '@shared/domain/discography'
import { getLogger } from '@main/core/logger'

const logger = getLogger('discography:publish')

/** What the operator gets back, so the sheet reports rather than claims. */
export interface PublishResult {
  /** Absolute path of the folder written. */
  folder: string
  /** File names inside it, in the order they were written. */
  files: string[]
  /** Tracks with no master, named so the gap is visible. */
  skipped: string[]
}

/** A name resolver, so this module never touches the roster itself. */
export type NameOf = (artistId: string) => string | null

/**
 * Assembles a distributor-ready folder for one release.
 *
 * ## What it is for
 *
 * Getting a record to a label or an aggregator means handing over the same
 * four things every time: the audio, the cover, the canvas, and the codes.
 * They lived in four places here — a bounce in a project folder, two copies
 * under `Media\`, and the identifiers in the database — and assembling them
 * was a manual job done under deadline, which is exactly when a wrong file
 * gets sent.
 *
 * ## Copies, never moves
 *
 * The master stays in its project and the artwork stays in `Media\`. This
 * folder is a *delivery*, not a new home: the release record still points at
 * the bounce beside the set that made it, which is the arrangement D5 exists
 * to protect. Nothing the operator owns is relocated by publishing.
 *
 * ## Re-publishing writes the same folder
 *
 * Overwritten in place rather than suffixed `(2)`. Publishing again after
 * fixing the artwork is the common case, and a litter of near-identical
 * folders would leave nobody able to say which one the distributor got.
 */
export async function publishRelease(
  release: DiscographyRelease,
  releasesRoot: string,
  nameOf: NameOf
): Promise<PublishResult> {
  const names = (ids: readonly string[]): string[] =>
    ids.map(nameOf).filter((name): name is string => Boolean(name))

  const mainNames = names(release.artistIds)
  const featuredNames = names(release.featuredArtistIds)

  const folderName = releaseFolderName(mainNames, release.title, featuredNames)
  const folder = join(releasesRoot, folderName)
  await mkdir(folder, { recursive: true })

  const files: string[] = []
  const skipped: string[] = []

  // Ordered by position, so a folder listing reads as the running order even
  // though the numbers already sort correctly.
  const ordered = [...release.tracks].sort((left, right) => left.position - right.position)
  const single = ordered.length === 1

  for (const track of ordered) {
    if (!track.master) {
      skipped.push(track.title || `Track ${track.position}`)
      continue
    }

    const extension = extname(track.master.path) || '.wav'
    /*
     * A single takes the folder's own name; anything longer is numbered.
     *
     * That asymmetry is what was asked for and what a distributor expects: a
     * single is one artefact and its file is the record, while an album is a
     * running order and its files have to sort into it.
     */
    const stem = single
      ? folderName
      : trackFileName(
          track.position,
          mainNames,
          track.title,
          names(trackFeatureIds(track.artistIds, release.artistIds))
        )

    const fileName = `${stem}${extension}`
    await copyFile(track.master.path, join(folder, fileName))
    files.push(fileName)
  }

  if (release.artwork.copiedPath) {
    const fileName = `${COVER_ART_STEM}${extname(release.artwork.copiedPath)}`
    await copyFile(release.artwork.copiedPath, join(folder, fileName))
    files.push(fileName)
  }

  if (release.canvas.copiedPath) {
    const fileName = `${CANVAS_STEM}${extname(release.canvas.copiedPath)}`
    await copyFile(release.canvas.copiedPath, join(folder, fileName))
    files.push(fileName)
  }

  await writeFile(
    join(folder, DETAILS_FILE_NAME),
    describeRelease(release, mainNames, featuredNames, names, skipped),
    'utf8'
  )
  files.push(DETAILS_FILE_NAME)

  logger.info(`Published "${release.title}" to ${folder}`)
  return { folder, files, skipped }
}

/**
 * Everything a filename cannot carry, as plain text.
 *
 * Plain text rather than JSON or a spreadsheet: the reader is a person filling
 * in a distributor's web form, and half the time it is the operator six months
 * later trying to remember a catalogue number. A file they can open in Notepad
 * and read top to bottom beats one that needs a tool.
 *
 * Absent fields are **omitted, not dashed**. A form to be copied from should
 * not offer a line reading `UPC: —` for somebody to paste.
 */
function describeRelease(
  release: DiscographyRelease,
  mainNames: readonly string[],
  featuredNames: readonly string[],
  names: (ids: readonly string[]) => string[],
  skipped: readonly string[]
): string {
  const lines: string[] = []
  const field = (label: string, value: string | null | undefined): void => {
    if (value) lines.push(`${label}: ${value}`)
  }

  lines.push(release.title.toUpperCase())
  if (release.subtitle) lines.push(release.subtitle)
  lines.push('')

  field('Kind', release.kind.toUpperCase())
  field('Status', release.status.toUpperCase())
  field('Release date', release.releaseDate)
  field('Main artist', mainNames.join(', '))
  field('Featuring', featuredNames.join(', '))
  lines.push('')

  if (release.credits.length > 0) {
    lines.push('CREDITS')
    for (const credit of release.credits) {
      const who = names(credit.artistIds).join(', ')
      if (!who && !credit.note) continue
      const role = ARTIST_ROLE_CREDIT[credit.role] ?? ARTIST_ROLE_CREDIT_FALLBACK
      lines.push(`  ${role}: ${[who, credit.note].filter(Boolean).join(' — ')}`)
    }
    lines.push('')
  }

  const trade: string[] = []
  const tradeField = (label: string, value: string | null | undefined): void => {
    if (value) trade.push(`  ${label}: ${value}`)
  }
  tradeField('Label', release.label)
  tradeField('Label URL', release.labelUrl)
  tradeField('Catalogue number', release.catalogueNumber)
  tradeField('UPC', release.upc)
  tradeField('Phonographic (P)', release.phonographicLine)
  tradeField('Copyright (C)', release.copyrightLine)
  if (trade.length > 0) {
    lines.push('TRADE')
    lines.push(...trade)
    lines.push('')
  }

  if (release.tracks.length > 0) {
    lines.push('RUNNING ORDER')
    for (const track of [...release.tracks].sort((l, r) => l.position - r.position)) {
      const number = String(track.position).padStart(2, '0')
      lines.push(`  ${number}. ${track.title || 'Untitled'}`)
      if (track.isrc) lines.push(`      ISRC: ${track.isrc}`)
      const also = names(trackFeatureIds(track.artistIds, release.artistIds))
      if (also.length > 0) lines.push(`      Featuring: ${also.join(', ')}`)
      // Named rather than counted, so the gap is actionable: the operator can
      // see which track to go and pick a master for.
      lines.push(`      Audio: ${track.master ? track.master.fileName : 'no master — not included'}`)
      if (track.notes) lines.push(`      Notes: ${track.notes}`)
    }
    lines.push('')
  }

  if (release.links.length > 0) {
    lines.push('WHERE IT IS')
    for (const link of release.links) {
      lines.push(`  ${link.label || link.platform.toUpperCase()}: ${link.url}`)
    }
    lines.push('')
  }

  if (release.notes) {
    lines.push('NOTES')
    lines.push(`  ${release.notes}`)
    lines.push('')
  }

  if (skipped.length > 0) {
    lines.push('NOT INCLUDED')
    lines.push('  These tracks have no final master, so no audio was copied:')
    for (const title of skipped) lines.push(`    - ${title}`)
    lines.push('')
  }

  lines.push(`Generated by Candy Haven, ${new Date().toISOString()}`)
  return lines.join('\r\n')
}
