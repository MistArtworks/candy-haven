import type { Db, IndexDescription } from 'mongodb'
import { getLogger } from '@main/core/logger'
import { migrateToProjectsLayout } from '@main/services/stacks/layout-migration'

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
   * TAGS — the operator's own labels on a project (ARCHIVE section).
   *
   * Like volumes, no filesystem counterpart: a tag is metadata, and which
   * projects carry one is held by `tagIds` on the project rather than by a
   * list here. See shared/domain/tags.constants.ts.
   */
  ArchiveTags: 'archive_tags',
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
    { key: { tagIds: 1 }, name: 'project_tag_ids' },
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
  [Collections.ArchiveTags]: [
    // Two tags cannot share a name; `nameKey` is the case-folded form the
    // service compares on, so `Deep` and `deep` collide here as intended. The
    // unique index is the last line of defence behind the service's own check.
    { key: { nameKey: 1 }, unique: true, name: 'tag_name_unique' },
    // The picker and the filter row both group by home shelf before ordering.
    { key: { folderId: 1, nameKey: 1 }, name: 'tag_by_folder' }
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
 * Indexes that used to be declared here and no longer are.
 *
 * Reconciled every boot like `INDEX_PLAN` itself, rather than dropped in a
 * migration, because an index is not document state: it is derived, the plan
 * above is already declarative, and a version-gated drop would never reach a
 * database that had passed that version before the drop was written — which
 * is exactly what happened to `project_tags`.
 *
 * That one is the cautionary tale. `tags` became `tagIds`, and the new index
 * was declared under the *same name* with a different key — which
 * `createIndexes` refuses, and it refuses the **whole batch** rather than the
 * one entry, so the projects collection quietly lost every other index it
 * declares. Renaming to `project_tag_ids` stops the collision; this list is
 * what clears the orphan left behind.
 */
const RETIRED_INDEXES: Record<string, string[]> = {
  [Collections.Projects]: ['project_tags']
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

  // Before the plan is applied, so a retired name can be reused by a new
  // index in the same boot rather than only in the one after it.
  for (const [collection, names] of Object.entries(RETIRED_INDEXES)) {
    for (const name of names) {
      try {
        await db.collection(collection).dropIndex(name)
        logger.info(`Dropped retired index ${name} on ${collection}`)
      } catch {
        // Absent already, which is the desired end state. `dropIndex` throws
        // rather than no-oping, and this runs on every boot.
      }
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
const SCHEMA_VERSION = 7

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

  if (from < 3) {
    logger.warn(`Migrating archive schema ${from} -> 3: projects carry tag ids`)

    /*
     * `tags: string[]` becomes `tagIds: string[]`, and **nothing is lost**.
     *
     * Tags were in the record, in this file's index plan and in the register's
     * filter row from the first build, but no screen could ever write one — so
     * every stored array is empty, and there is no name-to-id translation to
     * do. A project that somehow did carry names would lose them here, which
     * is why this is a rewrite rather than a best-effort conversion: inventing
     * tag documents from strings during a boot migration would create a
     * library the operator never chose, coloured at random.
     *
     * Contrast the version 2 migration above, which dropped whole collections.
     * This one touches one field and rescans nothing.
     */
    const result = await db
      .collection(Collections.Projects)
      .updateMany({}, { $unset: { tags: '' }, $set: { tagIds: [] } })

    logger.info(`Moved ${result.modifiedCount} projects onto tag ids`)
  }

  if (from < 4) {
    logger.warn(`Migrating archive schema ${from} -> 4: the pipeline ends at TRACK READY`)

    /*
     * `scheduled` and `released` are gone from `PROJECT_STAGE_IDS`, and this
     * has to run before anything reads a record again.
     *
     * Not cosmetic, and not optional. `ProjectStageSchema` is a zod enum over
     * that list, `stageHistory[].stage` uses it too, and `toRecord()` *skips*
     * any document that fails to parse. So a project left sitting in a removed
     * stage does not merely lose its stage — it vanishes from the register
     * entirely.
     *
     * And it does not come back. The comment on `toRecord()` reasons that "a
     * rescan rewrites it", which held for the failure that comment was written
     * for but not for this one: the skipped record is absent from `existing`,
     * so `reconcile()` takes the *new project* branch and issues an insert —
     * against a path the orphaned document still holds, on a unique index. The
     * insert collides and the project is unreadable for good, taking its stage
     * history, notes, tags and filing with it.
     *
     * Both values map to `ready`: a project that was scheduled or out in the
     * world is, at minimum, finished. History entries are rewritten in place
     * rather than dropped, so the timeline stays continuous and the dates the
     * operator accumulated survive.
     */
    const REMOVED = ['scheduled', 'released']
    const projects = db.collection(Collections.Projects)

    const current = await projects.updateMany(
      { stage: { $in: REMOVED } },
      { $set: { stage: 'ready' } }
    )

    // Positional-filtered update: one pass over the array rather than one
    // write per entry, and it touches only the entries that name a dead stage.
    const history = await projects.updateMany(
      { 'stageHistory.stage': { $in: REMOVED } },
      { $set: { 'stageHistory.$[entry].stage': 'ready' } },
      { arrayFilters: [{ 'entry.stage': { $in: REMOVED } }] }
    )

    logger.info(
      `Moved ${current.modifiedCount} projects and ${history.modifiedCount} stage histories onto TRACK READY`
    )
  }

  if (from < 5) {
    logger.warn(`Migrating archive schema ${from} -> 5: the tree moves inside Projects`)

    /*
     * Folder kind stops being derived from depth and starts being stored, so
     * every existing record needs one. The rule mirrors what `folderKindAtDepth`
     * would have said: a folder sitting at the top of the tree was a genre,
     * everything below it was a plain folder.
     *
     * Written before the layout move below, which re-points and re-kinds as it
     * goes — this pass exists so that a record is readable even if the move
     * cannot complete. `ArchiveFolderSchema.kind` defaults rather than requires
     * for the same reason, and for the reason recorded on the v4 step above: a
     * folder that fails validation is skipped on read, and a skipped folder
     * takes its whole subtree out of the tree with it.
     */
    const folders = db.collection(Collections.ArchiveFolders)

    const tops = await folders.updateMany(
      { kind: { $exists: false }, parentId: null },
      { $set: { kind: 'genre' } }
    )
    const rest = await folders.updateMany(
      { kind: { $exists: false } },
      { $set: { kind: 'folder' } }
    )

    logger.info(`Kinded ${tops.modifiedCount} shelves and ${rest.modifiedCount} folders`)

    // Moves real directories, so it lives beside the filesystem helpers. It is
    // idempotent by inspection rather than by flag: a half-finished run is
    // fixed by running it again.
    await migrateToProjectsLayout(db)
  }

  if (from < 6) {
    logger.warn(`Migrating archive schema ${from} -> 6: projects remember where they came from`)

    /*
     * Backfilling `originPath` for projects that are still outside the wrapper.
     *
     * For those the answer is exact: they have never been filed, so where they
     * are *is* where the register found them. A project already inside the
     * wrapper is deliberately left null — its current path is where it was
     * filed to, not where it came from, and writing that would define home as
     * the shelf it is already on, making "take off the shelf" a move to the
     * place it is leaving.
     *
     * A null origin is not a broken record. Unfiling refuses and offers the
     * File to… picker instead, which is the honest answer when nothing in the
     * database knows where the project started.
     */
    const result = await db.collection(Collections.Projects).updateMany(
      {
        originPath: { $exists: false },
        path: { $not: { $regex: '\\Candy Haven\\', $options: 'i' } }
      },
      [{ $set: { originPath: '$path' } }]
    )

    logger.info(`Recorded an origin for ${result.modifiedCount} unfiled projects`)
  }

  if (from < 7) {
    logger.warn(`Migrating archive schema ${from} -> 7: audio is marked, not filed`)

    /*
     * Two single-valued picks become two lists and a designation.
     *
     * `prefinal` and `final` both become entries in `masters`, and `final` is
     * cleared. That looks like losing the operator's choice, and it is the
     * careful option rather than the lazy one: `final` no longer means "this
     * record points at a file in the project folder" — it means "this file has
     * been moved into Release Mastered Tracks". Carrying the old value across
     * would have every previously-mastered project claiming a file lives
     * somewhere it has never been, and the first demote would try to move
     * something out of a directory it is not in.
     *
     * Nothing is actually lost: both paths survive as masters, which is what
     * they were, and re-designating one is a single click that also performs
     * the move the new meaning requires.
     *
     * `$setDifference` both de-duplicates (prefinal and final are often the
     * same file) and drops the nulls.
     */
    const result = await db
      .collection(Collections.Projects)
      .updateMany({ 'masters.prefinal': { $exists: true } }, [
        {
          $set: {
            'masters.wips': [],
            'masters.masters': {
              $setDifference: [['$masters.prefinal', '$masters.final'], [null]]
            },
            'masters.final': null
          }
        },
        { $unset: 'masters.prefinal' }
      ])

    logger.info(`Moved ${result.modifiedCount} projects onto audio marks`)
  }

  await collection.updateOne(
    { _id: 'schema' as never },
    { $set: { version: SCHEMA_VERSION, appliedAt: new Date() } },
    { upsert: true }
  )
}
