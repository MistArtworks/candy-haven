import { useMemo } from 'react'
import type { Target } from '@shared/domain/strip'
import { FOLDER_KIND_LABEL } from '@shared/domain/stacks.constants'
import { selectArchive, useSystemStore } from '@renderer/app/store/system.store'
import { useStacksTree } from '@renderer/hooks/useStacks'
import { useProject } from '@renderer/hooks/useProjects'
import { trailTo } from '@renderer/features/vestibule/components/shelf-tree'

/** What the ARCHIVE says of a pinned stack or project. */
export interface PinnedArchive {
  /** What it is and where it's filed: `GENRE · PERSONAL › DUBSTEP`. */
  where: string
  /** Its folder on disk. */
  path: string | null
  /** The ARCHIVE no longer has it. */
  gone: boolean
}

/**
 * The stack or project a pin points at, as the ARCHIVE has it now: its place
 * in the tree and its folder on disk, for the popups and REGULATION to show.
 *
 * Read only while the archive is up, and only for a stack or a project; for
 * anything else, or until it's read, null.
 */
export function usePinnedArchive(target: Target | null): PinnedArchive | null {
  const archive = useSystemStore(selectArchive)
  const online = archive.state === 'online' || archive.state === 'degraded'
  const stackId = target?.kind === 'stack' ? target.folderId : null
  const projectId = target?.kind === 'project' ? target.projectId : null

  const tree = useStacksTree(online && (stackId !== null || projectId !== null))
  const project = useProject(online ? projectId : null)

  return useMemo(() => {
    const folders = tree.data?.folders ?? []
    const trail = (id: string | null): string =>
      trailTo(folders, id)
        .map((folder) => folder.name)
        .join(' › ')

    if (stackId !== null) {
      if (!tree.data) return null
      const folder = folders.find((one) => one.id === stackId)
      if (!folder) return { where: 'No longer in the ARCHIVE', path: null, gone: true }
      return {
        where: `${FOLDER_KIND_LABEL[folder.kind]} · ${trail(folder.id)}`,
        path: folder.path,
        gone: false
      }
    }

    if (projectId !== null) {
      if (project.isError) return { where: 'No longer in the ARCHIVE', path: null, gone: true }
      const record = project.data
      if (!record) return null
      if (record.trashedAt !== null) {
        return { where: `${record.name} · in the bin`, path: record.path, gone: true }
      }
      return {
        where: `${record.name} · ${trail(record.folderId) || 'UNFILED'}`,
        path: record.path,
        gone: false
      }
    }

    return null
  }, [tree.data, project.data, project.isError, stackId, projectId])
}
