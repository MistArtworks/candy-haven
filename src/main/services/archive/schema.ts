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
  /** Release pipeline entries (TRANSMISSIONS section). */
  Releases: 'releases',
  /** Deliverables attached to a release: masters, artwork, metadata. */
  ReleaseAssets: 'release_assets',
  /** Audio found under a scanned root that belongs to no project folder. */
  UnlinkedMedia: 'unlinked_media',
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
    { key: { 'distribution.releaseDate': 1 }, name: 'project_release_date' }
  ],
  [Collections.UnlinkedMedia]: [{ key: { modifiedAt: -1 }, name: 'unlinked_recent' }],
  [Collections.ProjectVersions]: [
    { key: { projectId: 1, capturedAt: -1 }, name: 'version_by_project' },
    { key: { checksum: 1 }, name: 'version_checksum' }
  ],
  [Collections.Releases]: [
    { key: { status: 1, releaseDate: -1 }, name: 'release_pipeline' },
    { key: { title: 1 }, name: 'release_title' }
  ],
  [Collections.ReleaseAssets]: [{ key: { releaseId: 1, kind: 1 }, name: 'asset_by_release' }],
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

  await db
    .collection(Collections.Migrations)
    .updateOne(
      { _id: 'schema' as unknown as import('mongodb').ObjectId },
      { $set: { version: 1, appliedAt: new Date() } },
      { upsert: true }
    )

  logger.info('Schema reconciled')
}
