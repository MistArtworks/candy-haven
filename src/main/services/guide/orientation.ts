import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Orientation } from '@shared/domain/guide'
import { GUIDE_REVISION } from '@shared/domain/guide.constants'
import { getLogger } from '@main/core/logger'
import { getPaths } from '@main/core/paths'

const logger = getLogger('guide:orientation')

interface OrientationRecord {
  /** The tour revision the operator has already been shown, if any. */
  acknowledged: number | null
}

const EMPTY: OrientationRecord = { acknowledged: null }

/**
 * Whether to open the orientation tour, decided once per launch.
 *
 * Written against the same machinery as `ReleaseNotesStore` — a number in
 * userData, compared on boot against what the running build carries — with one
 * deliberate inversion, which is the whole reason this is a separate store
 * rather than a field on that one.
 *
 * **A fresh install speaks.** Release notes stay quiet on a first run because
 * there is no previous version for anything to have changed *from*, so a
 * changelog would be describing work the operator has never seen. A guide is
 * the opposite case: a first run is the only moment it is certain to be wanted,
 * and an operator who has just installed a console of nine departments is
 * exactly who it was written for.
 *
 * After that it returns only when `GUIDE_REVISION` moves. See the note there
 * for why that is not the application version.
 */
export class OrientationStore {
  private cached: OrientationRecord | null = null

  private get file(): string {
    return join(getPaths().userData, 'orientation.json')
  }

  private async read(): Promise<OrientationRecord> {
    if (this.cached) return this.cached

    try {
      const raw = await readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw) as Partial<OrientationRecord>
      this.cached = {
        acknowledged: typeof parsed.acknowledged === 'number' ? parsed.acknowledged : null
      }
    } catch {
      // Missing or unreadable: a first run, or a file somebody edited. Either
      // way an empty record is the right starting point — and on this store
      // that means the tour opens, which is the safe direction to fail in.
      this.cached = { ...EMPTY }
    }

    return this.cached
  }

  private async write(record: OrientationRecord): Promise<void> {
    this.cached = record
    try {
      await mkdir(dirname(this.file), { recursive: true })
      await writeFile(this.file, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
    } catch (cause) {
      // Costs one repeat of the tour on the next launch rather than anything
      // the operator loses, so it is logged and not surfaced.
      logger.warn('Could not record the orientation state', cause)
    }
  }

  /** The tour to open now, or null when the operator is up to date. */
  async orientation(): Promise<Orientation | null> {
    const record = await this.read()

    if (record.acknowledged === GUIDE_REVISION) return null

    return { revision: GUIDE_REVISION, firstRun: record.acknowledged === null }
  }

  /** Marks the running revision as read, so the tour does not return. */
  async acknowledge(): Promise<void> {
    await this.write({ acknowledged: GUIDE_REVISION })
  }

  /**
   * Forgets what has been read, so the tour opens on the next launch.
   *
   * Offered in REGULATION. An operator who dismissed the tour on their first
   * launch to get at the console has no other way back to the *automatic*
   * one — and being able to put the console back to how it greeted them is
   * worth more than the four lines it costs.
   */
  async reset(): Promise<void> {
    await this.write({ ...EMPTY })
  }
}
