import { randomUUID } from 'node:crypto'
import type { ArchiveTag, TagDraft, TagPatch, TagSummary } from '@shared/domain/tags'
import { randomTagColour, tagKey, validateTagName } from '@shared/domain/tags.constants'
import { isHexColour, normaliseHex } from '@shared/domain/stacks.constants'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogger } from '@main/core/logger'
import type { ArchiveService } from '@main/services/archive/archive.service'
import type { ProjectsService } from '@main/services/projects/projects.service'
import { TagsRepository } from './tags.repository'

const logger = getLogger('tags')

/**
 * TAGS — the operator's own labels on a project.
 *
 * The second quiet service in the ARCHIVE, after volumes, and for the same
 * reason: **nothing here touches the filesystem.** A tag says "this project is
 * like that"; the project itself stays filed on whatever shelf it was put on,
 * and no directory is created, moved or removed by anything below.
 *
 * That is what tags are *for*. The filing tree is one place per project — the
 * client deliberately kept it that shallow — so it can express `Dubstep` and
 * nothing else about a track. `140`, `Deep` and `Dark` are three more facts
 * about the same track, and there is no folder hierarchy that holds all four
 * without either nesting them in an arbitrary order or duplicating the work.
 *
 * Membership is read through `ProjectsService` rather than through a second
 * repository on the projects collection, and written the same way — the same
 * arrangement the stacks and volumes use, so projects keep one owner.
 */
export class TagsService {
  constructor(
    private readonly archive: ArchiveService,
    private readonly projects: ProjectsService
  ) {}

  private get repository(): TagsRepository {
    return new TagsRepository(this.archive.getDb())
  }

  // ---------------------------------------------------------------- reading

  /**
   * The whole library, with usage counts.
   *
   * The register is read once and tallied in memory rather than counted per
   * tag — the same reasoning recorded on `VolumesService.list`: an operator
   * has tens of tags and hundreds of projects, so one pass beats N round
   * trips.
   *
   * Binned projects do not count. A tag reading "4 projects" that turns up
   * one when clicked would be a worse answer than no figure at all.
   */
  async list(): Promise<TagSummary[]> {
    const tags = await this.repository.listAll()
    if (tags.length === 0) return []

    const records = await this.projects.listRecords()
    return summarise(tags, countUsage(records))
  }

  /**
   * Every tag, without touching the register.
   *
   * For `ProjectsService.getRegistry`, which is already holding every record
   * and does its own counting as it goes — calling `list()` there would read
   * the whole collection a second time to produce figures it can see.
   */
  async listPlain(): Promise<ArchiveTag[]> {
    return this.repository.listAll()
  }

  // ---------------------------------------------------------------- writing

  /**
   * Creates a tag, optionally attaching it to a project in the same breath.
   *
   * `attachTo` is not a convenience. The picker's "create «140»" is one
   * gesture, and doing it as two calls from the renderer would leave a new tag
   * attached to nothing whenever the second failed — a library slowly filling
   * with labels the operator believes they applied.
   *
   * A name that already exists is **returned rather than refused**. The picker
   * offers "create" only for text matching nothing, but two windows and a
   * stale list can still race it, and the operator's intent in that case is
   * plainly "give me the 140 tag", not an error dialog.
   */
  async create(draft: TagDraft): Promise<TagSummary> {
    const verdict = validateTagName(draft.name)
    if (!verdict.ok) {
      throw new AppError(verdict.reason ?? 'That tag name cannot be used.', {
        code: ErrorCode.Validation
      })
    }

    const name = draft.name.trim()
    const existing = await this.repository.findByName(name)

    if (existing) {
      if (draft.attachTo) await this.attach(draft.attachTo, existing.id)
      logger.info(`Tag "${name}" already exists; reusing it`)
      return this.summariseOne(existing)
    }

    const now = Date.now()
    const tag: ArchiveTag = {
      id: randomUUID(),
      name,
      colour:
        draft.colour && isHexColour(draft.colour) ? normaliseHex(draft.colour) : randomTagColour(),
      folderId: draft.folderId ?? null,
      createdAt: now,
      updatedAt: now
    }

    await this.repository.insert(tag)
    if (draft.attachTo) await this.attach(draft.attachTo, tag.id)

    logger.info(`Created tag "${tag.name}"`)
    return this.summariseOne(tag)
  }

  /**
   * Renames, recolours or re-homes a tag.
   *
   * Renaming needs no rewrite anywhere else: projects hold tag *ids*, so every
   * chip in the application follows a rename automatically. That is the whole
   * argument for ids over names, and it is the reason this method is three
   * lines rather than a pass over the register.
   */
  async update(id: string, patch: TagPatch): Promise<TagSummary> {
    const current = await this.requireTag(id)
    const next: ArchiveTag = { ...current, updatedAt: Date.now() }

    if (patch.name !== undefined) {
      const verdict = validateTagName(patch.name)
      if (!verdict.ok) {
        throw new AppError(verdict.reason ?? 'That tag name cannot be used.', {
          code: ErrorCode.Validation
        })
      }

      const name = patch.name.trim()
      const clash = await this.repository.findByName(name)
      // Renaming `deep` to `Deep` is a re-spelling of itself, not a collision.
      if (clash && clash.id !== id) {
        throw new AppError(`There is already a tag called "${clash.name}".`, {
          code: ErrorCode.Validation,
          hint: 'Tag names are compared without regard to case.'
        })
      }

      next.name = name
    }

    if (patch.colour !== undefined) next.colour = normaliseHex(patch.colour)
    if (patch.folderId !== undefined) next.folderId = patch.folderId

    await this.repository.replace(next)
    return this.summariseOne(next)
  }

  /**
   * Drops a tag and detaches it from everything carrying it.
   *
   * The detach comes first and the delete second, which is this department's
   * ordering rule pointed at a database instead of a disk: if the sweep fails
   * halfway, the tag still exists and the operator can try again, whereas
   * deleting first would leave dangling ids behind an error message.
   *
   * Binned projects are swept too. A project restored from the bin carrying an
   * id nothing resolves would draw a chip-shaped hole.
   */
  async delete(id: string): Promise<{ detached: number }> {
    await this.requireTag(id)

    const detached = await this.projects.detachTag(id)
    await this.repository.deleteById(id)

    logger.info(`Deleted tag ${id}, detached from ${detached} project(s)`)
    return { detached }
  }

  // --------------------------------------------------------------- internals

  /** Adds one tag to one project, leaving whatever else it carries alone. */
  private async attach(projectId: string, tagId: string): Promise<void> {
    const project = await this.projects.get(projectId)
    if (project.tagIds.includes(tagId)) return
    await this.projects.patchProject(projectId, { tagIds: [...project.tagIds, tagId] })
  }

  private async requireTag(id: string): Promise<ArchiveTag> {
    const tag = await this.repository.findById(id)
    if (!tag) {
      throw new AppError('That tag is no longer in the register.', { code: ErrorCode.NotFound })
    }
    return tag
  }

  private async summariseOne(tag: ArchiveTag): Promise<TagSummary> {
    const records = await this.projects.listRecords()
    return summarise([tag], countUsage(records))[0]
  }
}

// ------------------------------------------------------------------ helpers

/**
 * Tag ids to the number of live projects carrying them.
 *
 * One pass over the register, shared by `list` and `summariseOne`.
 */
function countUsage(
  records: readonly { tagIds: string[]; trashedAt: number | null }[]
): Map<string, number> {
  const counts = new Map<string, number>()

  for (const record of records) {
    if (record.trashedAt !== null) continue
    for (const tagId of record.tagIds) {
      counts.set(tagId, (counts.get(tagId) ?? 0) + 1)
    }
  }

  return counts
}

/**
 * Orders the library the way both the picker and the filter row want it.
 *
 * Alphabetical, case-folded. Deliberately *not* by usage: a chip row that
 * reorders itself as projects are tagged is one the operator can never build
 * muscle memory for, and the tags most worth reaching for are often the ones
 * that have just been made.
 */
function summarise(tags: readonly ArchiveTag[], counts: Map<string, number>): TagSummary[] {
  return tags
    .map((tag) => ({ ...tag, usageCount: counts.get(tag.id) ?? 0 }))
    .sort((a, b) => tagKey(a.name).localeCompare(tagKey(b.name)))
}
