import type { Db, IndexDescription } from 'mongodb'
import { WRAPPER_DIRECTORY_NAME } from '@shared/domain/stacks.constants'
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
   * ARTISTS — the roster of people the practice works with.
   *
   * No filesystem counterpart beyond one copied picture: an artist is a
   * record, and which projects credit them is held by `artistIds` on the
   * project rather than by a list here. Deliberately unrelated to the ARCHIVE
   * tree's `artist` folder kind — see docs/DISCOGRAPHY.md, decision D3.
   */
  Artists: 'archive_artists',
  /**
   * DISCOGRAPHY — the public record of what shipped.
   *
   * Replaces `archive_volumes` and the stood-down `releases`, which between
   * them were two records describing one thing. Unlike every other ARCHIVE
   * collection its tracklist is held *here* rather than on the project, and
   * the reason is that a track need not have a project at all — see the note
   * on `ReleaseTrackSchema`.
   */
  Discography: 'discography',
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
  [Collections.Artists]: [
    // Two artists cannot share a name; `nameKey` is the case-folded form the
    // service compares on, so `Nasko` and `nasko` collide here as intended.
    // The unique index is the last line of defence behind the service's check.
    { key: { nameKey: 1 }, unique: true, name: 'artist_name_unique' },
    { key: { favourite: -1, nameKey: 1 }, name: 'artist_roster_order' }
  ],
  [Collections.Discography]: [
    // The catalogue's default read is "newest first", and every other lens is
    // a filter over the same order.
    { key: { releaseDate: -1 }, name: 'release_by_date' },
    { key: { status: 1, releaseDate: -1 }, name: 'release_by_status' },
    { key: { kind: 1, releaseDate: -1 }, name: 'release_by_kind' },
    { key: { title: 1 }, name: 'release_title' },
    // The reverse lookup the ARCHIVE reads through: which release is this
    // project a track on. Multikey over the embedded tracklist.
    { key: { 'tracks.projectId': 1 }, name: 'release_track_project' },
    { key: { artistIds: 1 }, name: 'release_artists' }
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
const SCHEMA_VERSION = 10

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
    /*
     * Substring test rather than a regex.
     *
     * The first version matched on `$regex` and had to express a Windows path
     * separator through two layers of escaping — TypeScript's string literal,
     * then the regex engine. It reached the driver as a pattern ending in a
     * lone backslash, which is not a regex at all, and took the whole boot
     * sequence down with it. `$indexOfCP` compares plain strings and has
     * nothing to escape.
     *
     * Both sides are lowercased because these are Windows paths: the same
     * directory can be stored with different casing than it was walked with.
     */
    // Built from a character code rather than written as an escape. A path
    // separator in this file has to survive a TypeScript string literal on its
    // way to the driver, and getting that wrong is what broke the previous
    // version — there is nothing to get wrong if no backslash is typed.
    const separator = String.fromCharCode(92)
    const marker = separator + WRAPPER_DIRECTORY_NAME.toLowerCase() + separator

    const result = await db
      .collection(Collections.Projects)
      .updateMany({ originPath: { $exists: false } }, [
        {
          $set: {
            originPath: {
              $cond: [{ $gte: [{ $indexOfCP: [{ $toLower: '$path' }, marker] }, 0] }, null, '$path']
            }
          }
        }
      ])

    logger.info(`Recorded an origin for ${result.modifiedCount} projects`)
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

  if (from < 8) {
    logger.warn(`Migrating archive schema ${from} -> 8: mixes are marked separately`)

    /*
     * A third bucket, added empty.
     *
     * Nothing is reclassified. A file already marked a master was marked as one
     * deliberately, and a WIP likewise; guessing which of them the operator
     * would now call a mix would be inventing a decision they never made. The
     * bucket starts empty and fills as they mark at the MIX stage.
     *
     * `MasterSelectionSchema.mixes` defaults, so this is belt and braces — but
     * writing the field means a record that is read, patched and written back
     * carries it explicitly rather than relying on the default surviving every
     * round trip.
     */
    const result = await db
      .collection(Collections.Projects)
      .updateMany({ 'masters.mixes': { $exists: false } }, { $set: { 'masters.mixes': [] } })

    logger.info(`Added a mixes bucket to ${result.modifiedCount} projects`)
  }

  if (from < 9) {
    logger.warn(`Migrating archive schema ${from} -> 9: volumes become the discography`)
    await migrateVolumesToDiscography(db)
  }

  if (from < 10) {
    logger.warn(`Migrating archive schema ${from} -> 10: release statuses become two`)
    await migrateReleaseStatuses(db)
  }

  await collection.updateOne(
    { _id: 'schema' as never },
    { $set: { version: SCHEMA_VERSION, appliedAt: new Date() } },
    { upsert: true }
  )
}

/**
 * Folds the five release statuses onto two.
 *
 * `RELEASE_STATUSES` went from `idea` · `planned` · `scheduled` · `released` ·
 * `shelved` to `scheduled` · `released` on the operator's instruction. The
 * three removed values all mean "not out yet", so each becomes `scheduled`.
 *
 * ## Why this runs at all, when `.catch` already covers it
 *
 * `DiscographyReleaseSchema.status` carries `.catch('scheduled')`, so an
 * unmigrated document already *reads* correctly. This is not about reading.
 *
 * Without it the stored value stays `shelved` until something happens to
 * rewrite that release, so the database and the screen disagree for as long as
 * nobody touches the record — and the next person to read the collection by
 * hand finds a status the application no longer has. `.catch` is the safety
 * net for the gap between this build starting and this migration finishing,
 * not a substitute for it.
 *
 * ## What is lost, and it is real
 *
 * `shelved` on a release becomes `scheduled`, which says the opposite:
 * something parked indefinitely now reads as committed to. Nothing else can
 * be done — the status that meant "parked" does not exist any more, and
 * inventing a date or deleting the entry would both be worse. Parking work is
 * the project's SHELVED *stage*, which this does not touch.
 *
 * Unlike version 2 this drops nothing and rescans nothing.
 */
async function migrateReleaseStatuses(db: Db): Promise<void> {
  const result = await db
    .collection(Collections.Discography)
    .updateMany(
      { status: { $in: ['idea', 'planned', 'shelved'] } },
      { $set: { status: 'scheduled' } }
    )

  logger.info(`Folded ${result.modifiedCount} release statuses onto SCHEDULED`)
}

/**
 * Carries VOLUMES and the stood-down RELEASES into the discography.
 *
 * Decision D2: one record is the album, so the two that were both trying to be
 * it are merged. Nothing is dropped on the floor — this is the opposite of the
 * v2 migration, which rebuilt the register from a rescan. There is no rescan
 * available here, because none of this is on disk: a volume was always
 * metadata, and losing it would mean losing the only record that those eight
 * tracks were one album.
 *
 * Three passes, in this order:
 *
 *  1. Every volume becomes a release, with its tracks assembled from the
 *     projects that pointed at it — ordered by `trackNumber`, then by name for
 *     the ones that never got a number.
 *  2. Every *old* release document that named a project not already covered
 *     becomes a single, so a shipped one-off is not lost. Its deliverables
 *     carry across: `cover` becomes `artwork`, `canvas` stays, and `master` is
 *     dropped because `Release Mastered Tracks` is where a final master lives
 *     now and a second answer is exactly what D2 exists to prevent.
 *  3. `volumeId` and `trackNumber` leave the projects, and `artistIds` arrives
 *     empty. A volume's free-text `artist` string is **not** converted into
 *     artist records: that is the `tags` → `tagIds` lesson from v3, where
 *     inventing records from strings during a boot migration would create a
 *     roster the operator never chose. The string is preserved verbatim in the
 *     release's notes instead, so nothing is lost and nothing is invented.
 *
 * Idempotent by inspection: it reads the collections it is about to empty and
 * skips anything already carried across by id.
 */
async function migrateVolumesToDiscography(db: Db): Promise<void> {
  const volumes = await db.collection('archive_volumes').find({}).toArray()
  const projects = await db.collection(Collections.Projects).find({}).toArray()
  const oldReleases = await db.collection('releases').find({}).toArray()
  const discography = db.collection(Collections.Discography)

  const now = Date.now()
  const carried = new Set(
    (await discography.find({}, { projection: { _id: 1 } }).toArray()).map((doc) => String(doc._id))
  )

  /** Volume kinds map straight across; the other two release kinds are new. */
  const KIND: Record<string, string> = { album: 'album', ep: 'ep', compilation: 'compilation' }

  const documents: Record<string, unknown>[] = []
  const claimed = new Set<string>()

  for (const volume of volumes) {
    const id = String(volume._id)
    if (carried.has(id)) continue

    const members = projects
      .filter((project) => String(project.volumeId ?? '') === id)
      .sort((a, b) => {
        const left = typeof a.trackNumber === 'number' ? a.trackNumber : Number.MAX_SAFE_INTEGER
        const right = typeof b.trackNumber === 'number' ? b.trackNumber : Number.MAX_SAFE_INTEGER
        if (left !== right) return left - right
        return String(a.name ?? '').localeCompare(String(b.name ?? ''))
      })

    for (const member of members) claimed.add(String(member._id))

    const artist = String(volume.artist ?? '').trim()
    const notes = [String(volume.notes ?? '').trim(), artist ? `Credited to ${artist}.` : '']
      .filter(Boolean)
      .join('\n\n')

    documents.push({
      _id: id,
      kind: KIND[String(volume.kind)] ?? 'album',
      title: String(volume.title ?? 'Untitled'),
      subtitle: '',
      artistIds: [],
      featuredArtistIds: [],
      label: '',
      labelUrl: '',
      catalogueNumber: '',
      // `released` was the only signal a volume carried about being out.
      // `scheduled` is the other half of a two-state set — see
      // RELEASE_STATUSES. This wrote `planned` while that status existed.
      status: volume.released === true ? 'released' : 'scheduled',
      releaseDate: null,
      upc: '',
      phonographicLine: '',
      copyrightLine: '',
      // A volume's artwork was a path it merely pointed at. Recorded as the
      // source so the operator can re-attach it, and left uncopied, because a
      // boot migration is the wrong place to start moving image files around.
      artwork: {
        sourcePath: volume.artworkPath ?? null,
        copiedPath: null,
        copiedAt: null
      },
      canvas: { sourcePath: null, copiedPath: null, copiedAt: null },
      links: [],
      tracks: members.map((member, index) => ({
        id: `${id}-t${index + 1}`,
        position: index + 1,
        title: String(member.name ?? ''),
        projectId: String(member._id),
        artistIds: [],
        isrc: '',
        durationMs: 0,
        notes: ''
      })),
      colour: volume.colour ?? '#6f6656',
      notes,
      favourite: volume.favourite === true,
      createdAt: typeof volume.createdAt === 'number' ? volume.createdAt : now,
      updatedAt: now
    })
  }

  for (const release of oldReleases) {
    const id = `rel-${String(release._id)}`
    if (carried.has(id)) continue

    const subjectId = String(release.subjectId ?? '')
    // A release whose subject is already a track on a migrated volume is that
    // volume's deliverables, not a second entry for the same music.
    if (!subjectId || claimed.has(subjectId)) continue

    const subject = projects.find((project) => String(project._id) === subjectId)

    documents.push({
      _id: id,
      kind: 'single',
      title: String(release.title ?? subject?.name ?? 'Untitled'),
      subtitle: '',
      artistIds: [],
      featuredArtistIds: [],
      label: '',
      labelUrl: '',
      catalogueNumber: '',
      status: release.releaseDate ? 'released' : 'scheduled',
      releaseDate: release.releaseDate ?? null,
      upc: '',
      phonographicLine: '',
      copyrightLine: '',
      artwork: {
        sourcePath: release.cover?.sourcePath ?? null,
        copiedPath: release.cover?.copiedPath ?? null,
        copiedAt: release.cover?.copiedAt ?? null
      },
      canvas: {
        sourcePath: release.canvas?.sourcePath ?? null,
        copiedPath: release.canvas?.copiedPath ?? null,
        copiedAt: release.canvas?.copiedAt ?? null
      },
      links: [],
      tracks: [
        {
          id: `${id}-t1`,
          position: 1,
          title: String(subject?.name ?? release.title ?? ''),
          projectId: subject ? subjectId : null,
          artistIds: [],
          isrc: '',
          durationMs: 0,
          notes: ''
        }
      ],
      colour: '#6f6656',
      notes: String(release.notes ?? ''),
      favourite: false,
      createdAt: typeof release.createdAt === 'number' ? release.createdAt : now,
      updatedAt: now
    })
  }

  if (documents.length > 0) {
    await discography.insertMany(documents as never[], { ordered: false })
    logger.info(`Carried ${documents.length} volumes and releases into the discography`)
  }

  /*
   * The project side, last.
   *
   * After the reads above, so a run interrupted between the two leaves the
   * volumes still readable and simply does the whole thing again — which is
   * what "idempotent by inspection" buys. Dropping these first and failing
   * halfway would lose the ordering irrecoverably.
   */
  const cleared = await db
    .collection(Collections.Projects)
    .updateMany({ volumeId: { $exists: true } }, { $unset: { volumeId: '', trackNumber: '' } })

  /*
   * Two writes rather than one, and the split is not cosmetic.
   *
   * Combining them would have `$set: { artistIds: [] }` fire for every project
   * matching *either* condition — so a re-run after credits had been entered
   * would empty them. Narrowing the second to projects that genuinely have no
   * field is what makes this safe to run twice.
   */
  const credited = await db
    .collection(Collections.Projects)
    .updateMany({ artistIds: { $exists: false } }, { $set: { artistIds: [] } })

  logger.info(
    `Moved ${cleared.modifiedCount} projects off volumes; opened credits on ${credited.modifiedCount}`
  )
}
