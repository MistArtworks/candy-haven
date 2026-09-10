import { app } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ReleaseArrival } from '@shared/domain/update'
import { getLogger } from '@main/core/logger'
import { getPaths } from '@main/core/paths'

const logger = getLogger('updates:notes')

/** Where the release notes are fetched from when none were cached. */
const RELEASES_API = 'https://api.github.com/repos/MistArtworks/candy-haven/releases/tags'

interface NotesRecord {
  /** The version the operator has already been shown notes for. */
  acknowledged: string | null
  /** Notes captured when an update was downloaded, keyed by version. */
  cached: Record<string, { notes: string; releasedAt: string | null }>
}

const EMPTY: NotesRecord = { acknowledged: null, cached: {} }

/**
 * What changed, shown once after the version it describes starts running.
 *
 * The updater already carries release notes — but only in memory, and only in
 * the session that *downloaded* the update. By the time the operator is running
 * the new version, the process that knew about it has exited. So the version
 * last shown is written down, and on every boot the running version is compared
 * against it.
 *
 * Comparing versions rather than trusting the updater also covers the case the
 * updater cannot see: an installer run by hand. The operator gets the notes
 * either way, which is the point — a build that changed a department out from
 * under them should say so.
 *
 * **A fresh install is silent.** With nothing acknowledged there is no previous
 * version, so there is nothing to have changed *from*, and greeting a first run
 * with a changelog for software the operator has not used yet is noise. The
 * running version is recorded instead, and the next update is the first to
 * speak.
 */
export class ReleaseNotesStore {
  private cached: NotesRecord | null = null

  private get file(): string {
    return join(getPaths().userData, 'release-notes.json')
  }

  private async read(): Promise<NotesRecord> {
    if (this.cached) return this.cached

    try {
      const raw = await readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw) as Partial<NotesRecord>
      this.cached = {
        acknowledged: typeof parsed.acknowledged === 'string' ? parsed.acknowledged : null,
        cached: parsed.cached ?? {}
      }
    } catch {
      // Missing or unreadable: the first run, or a file somebody edited. Either
      // way an empty record is the right starting point.
      this.cached = { ...EMPTY }
    }

    return this.cached
  }

  private async write(record: NotesRecord): Promise<void> {
    this.cached = record
    try {
      await mkdir(dirname(this.file), { recursive: true })
      await writeFile(this.file, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
    } catch (cause) {
      logger.warn('Could not record the release notes state', cause)
    }
  }

  /**
   * Keeps the notes for a version that has just been downloaded.
   *
   * Called while the *old* version is still running, which is the only moment
   * the updater has them. Cheap insurance against the machine being offline the
   * next time it starts, when fetching them would fail.
   */
  async remember(version: string, notes: string | null, releasedAt: string | null): Promise<void> {
    if (!notes) return

    const record = await this.read()
    await this.write({
      ...record,
      cached: { ...record.cached, [version]: { notes, releasedAt } }
    })
  }

  /**
   * The notes to show now, or null if there is nothing to say.
   *
   * Never throws and never blocks the boot on the network: a fetch that fails
   * yields an arrival with no body rather than no arrival at all, because "you
   * are on a new version and here is which" is still worth saying when the
   * changelog cannot be reached.
   */
  async arrival(): Promise<ReleaseArrival | null> {
    const record = await this.read()
    const version = app.getVersion()

    if (record.acknowledged === version) return null

    // First run: record where we are and stay quiet. See the class note.
    if (record.acknowledged === null) {
      await this.write({ ...record, acknowledged: version })
      return null
    }

    const held = record.cached[version]
    if (held) {
      return {
        version,
        notes: held.notes,
        releasedAt: held.releasedAt,
        previous: record.acknowledged
      }
    }

    const fetched = await this.fetch(version)
    return {
      version,
      notes: fetched?.notes ?? null,
      releasedAt: fetched?.releasedAt ?? null,
      previous: record.acknowledged
    }
  }

  /** Marks the running version as read, so the notice does not return. */
  async acknowledge(): Promise<void> {
    const record = await this.read()
    await this.write({ ...record, acknowledged: app.getVersion() })
  }

  /**
   * The notes from the release itself.
   *
   * Tried both with and without a `v` prefix. Releases up to v1.0.0 were tagged
   * `vX.Y.Z` and later ones are tagged bare, so a build installed across that
   * change would otherwise find nothing at the tag it expects.
   */
  private async fetch(version: string): Promise<{ notes: string; releasedAt: string } | null> {
    for (const tag of [version, `v${version}`]) {
      try {
        const response = await fetch(`${RELEASES_API}/${encodeURIComponent(tag)}`, {
          headers: { accept: 'application/vnd.github+json' },
          signal: AbortSignal.timeout(8_000)
        })
        if (!response.ok) continue

        const body = (await response.json()) as { body?: string; published_at?: string }
        const notes = (body.body ?? '').trim()
        if (notes) return { notes, releasedAt: body.published_at ?? '' }
      } catch (cause) {
        logger.warn(`Could not fetch the notes for ${tag}`, cause)
      }
    }

    return null
  }
}
