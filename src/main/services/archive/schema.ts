import type { Db, IndexDescription } from 'mongodb'
import { getLogger } from '@main/core/logger'

const logger = getLogger('archive:schema')

/**
 * Canonical collection names. Feature modules import from here rather than
 * hard-coding strings, so a rename is a single edit.
 */
export const Collections = {
  /** Ableton project registry (ARCHIVE section). */
  Projects: 'projects',
  /** Point-in-time snapshots of a project's .als file and assets. */
  ProjectVersions: 'project_versions',
  /**
   * Releases (ARCHIVE section).
   *
   * Each document owns a real directory under `<wrapper>/RELEASES`, so this
   * collection and the filesystem are two views of one thing.
   */
  Releases: 'releases',
  /**
   * VOLUMES — albums, EPs and compilations (ARCHIVE section).
   *
   * The one ARCHIVE collection with no filesystem counterpart at all: a volume
   * is metadata, and its tracks are held by `volumeId` on the project rather
   * than by a list here. See domain/volumes.constants.ts.
   */
  ArchiveVolumes: 'archive_volumes',
  /**
   * THE STACKS — the filing tree projects are sorted into (ARCHIVE section).
   *
   * Each document describes a real directory on disk, so this collection and
   * the filesystem are two views of one thing. The scan reconciles them.
   */
  ArchiveFolders: 'archive_folders',
  /**
   * The dated register — sessions, deliveries and observances (CALENDAR).
   *
   * Nothing here is derived from a project or a release: an entry is a dated
   * statement of intent the operator made. See shared/domain/calendar.ts.
   */
  Calendar: 'calendar',
  /** Stream overlay scenes and layouts (OBSERVATORY section). */
  Overlays: 'overlays',
  /** Natural-language commands and their resolved actions (INTERFACE section). */
  CommandHistory: 'command_history',
  /** Append-only operational audit trail. */
  Events: 'events',
  /** Applied schema migration records. */
  Migrations: 'migrations'
} as const

export type CollectionName = (typeof Collections)[keyof typeof Collections]

/**
 * Indexes are declared declaratively and reconciled on every boot. MongoDB
 * treats createIndexes as idempotent, so re-running is safe and cheap.
 */
const INDEX_PLAN: Record<string, IndexDescription[]> = {
  [Collections.Projects]: [
    { key: { path: 1 }, unique: true, name: 'project_path_unique' },
    { key: { name: 1 }, name: 'project_name' },
    { key: { updatedAt: -1 }, name: 'project_recent' },
    { key: { tags: 1 }, name: 'project_tags' },
    // The board groups by stage and the register sorts by last touched; both
    // are the default reads of the ARCHIVE section.
    { key: { stage: 1, lastTouchedAt: -1 }, name: 'project_pipeline' },
    { key: { lastTouchedAt: -1 }, name: 'project_touched' },
    // The folder browser's every read is "what is filed here", and the volumes
    // lens asks the same question of `volumeId`.
    { key: { folderId: 1 }, name: 'project_folder' },
    { key: { volumeId: 1, trackNumber: 1 }, name: 'project_volume_order' },
    { key: { category: 1 }, name: 'project_category' }
  ],
  [Collections.ArchiveFolders]: [
    // Two folders cannot describe one directory; the unique index is the last
    // line of defence behind the service's own sibling-name check.
    { key: { path: 1 }, unique: true, name: 'folder_path_unique' },
    { key: { parentId: 1, order: 1 }, name: 'folder_siblings' }
  ],
  [Collections.Calendar]: [
    // Every read the department makes is "what is on these dates", in order.
    { key: { date: 1, startMinute: 1 }, name: 'calendar_by_date' }
  ],
  [Collections.ProjectVersions]: [
    { key: { projectId: 1, capturedAt: -1 }, name: 'version_by_project' },
    { key: { checksum: 1 }, name: 'version_checksum' }
  ],
  [Collections.Releases]: [
    { key: { releaseDate: -1 }, name: 'release_schedule' },
    { key: { title: 1 }, name: 'release_title' },
    // A subject can only be released once, and the create path checks for it.
    // The unique index is the last line of defence behind that check.
    { key: { subjectId: 1 }, unique: true, name: 'release_subject_unique' }
  ],
  [Collections.ArchiveVolumes]: [
    { key: { title: 1 }, name: 'volume_title' },
    { key: { kind: 1, title: 1 }, name: 'volume_by_kind' }
  ],
  [Collections.Overlays]: [
    { key: { name: 1 }, unique: true, name: 'overlay_name_unique' },
    { key: { active: 1 }, name: 'overlay_active' }
  ],
  [Collections.CommandHistory]: [
    { key: { createdAt: -1 }, name: 'command_recent' },
    // Commands are diagnostic data, not records of value — expire after 90 days.
    { key: { createdAt: 1 }, name: 'command_ttl', expireAfterSeconds: 60 * 60 * 24 * 90 }
  ],
  [Collections.Events]: [
    { key: { occurredAt: -1 }, name: 'event_recent' },
    { key: { kind: 1, occurredAt: -1 }, name: 'event_by_kind' }
  ]
}

/**
 * Reconciles collections and indexes.
 *
 * Index creation failures are logged but do not abort boot: a stale index
 * conflict should degrade query performance, not lock the operator out of the
 * application entirely.
 */
export async function applySchema(db: Db): Promise<void> {
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name)
  )

  for (const name of Object.values(Collections)) {
    if (!existing.has(name)) {
      await db.createCollection(name)
      logger.info(`Created collection ${name}`)
    }
  }

  for (const [collection, indexes] of Object.entries(INDEX_PLAN)) {
    try {
      await db.collection(collection).createIndexes(indexes)
    } catch (error) {
      logger.warn(`Index reconciliation failed for ${collection}`, error)
    }
  }

  await applyMigrations(db)

  logger.info('Schema reconciled')
}

/**
 * Current schema version. Bump when stored documents change shape.
 */
const SCHEMA_VERSION = 2

/**
 * Collections dropped by the version 2 migration.
 *
 * The ARCHIVE rework changed what a project record *is* — categories replaced
 * release kinds, volumes and releases became separate objects, distribution and
 * marketing were removed entirely — and the TRANSMISSIONS department was
 * retired. Nothing stored under the old shape describes the new model closely
 * enough to be worth a field-by-field migration, and the operator chose a clean
 * rescan over carrying translation code forever.
 *
 * Note what this costs and what it does not: the register is rebuilt from disk
 * in seconds, and **no file is touched**. What is genuinely lost is the
 * operator-authored half — stage history, notes, tags, favourites and filing.
 * That was accepted knowingly.
 */
const DROPPED_AT_V2 = [
  Collections.Projects,
  Collections.ArchiveFolders,
  Collections.Releases,
  'release_assets',
  'transmission_tasks',
  'unlinked_media'
]

interface MigrationRecord {
  version?: number
}

/**
 * Brings the database up to the current schema version.
 *
 * Runs after collections and indexes are reconciled, so a dropped collection is
 * recreated empty on the next boot rather than leaving a hole — and re-running
 * is a no-op once the version is recorded.
 */
async function applyMigrations(db: Db): Promise<void> {
  const collection = db.collection<MigrationRecord>(Collections.Migrations)
  const current = await collection.findOne({ _id: 'schema' as never })
  const from = current?.version ?? 0

  if (from < 2) {
    logger.warn(`Migrating archive schema ${from} -> 2: rebuilding the ARCHIVE register`)

    for (const name of DROPPED_AT_V2) {
      try {
        await db.collection(name).drop()
        logger.info(`Dropped ${name}`)
      } catch {
        // Already absent. `drop` throws rather than no-oping on a missing
        // collection, and a missing one is exactly the desired end state.
      }
    }
  }

  await collection.updateOne(
    { _id: 'schema' as never },
    { $set: { version: SCHEMA_VERSION, appliedAt: new Date() } },
    { upsert: true }
  )
}
