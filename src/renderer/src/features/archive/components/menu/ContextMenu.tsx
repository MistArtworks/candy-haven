import { useState, type ReactNode } from 'react'
import type { ProjectSummary } from '@shared/domain/projects'
import type { ArchiveFolder } from '@shared/domain/stacks'
import type { VolumeSummary } from '@shared/domain/volumes'
import { VOLUME_KIND_LABEL } from '@shared/domain/volumes.constants'
import { MenuDivider, MenuItem as Item, MenuLabel, MenuSurface } from './MenuSurface'
import styles from '../stacks/stacks.module.scss'

/** What was right-clicked, and where. */
export type MenuTarget =
  | { kind: 'folder'; folder: ArchiveFolder; x: number; y: number }
  | { kind: 'project'; project: ProjectSummary; x: number; y: number }
  | { kind: 'volume'; volume: VolumeSummary; x: number; y: number }

export interface ContextMenuProps {
  target: MenuTarget
  /**
   * Every live folder, for the "File to…" walk.
   *
   * The whole tree rather than a pre-filtered list: the picker navigates it by
   * `parentId`, so it needs every level, not just the ones a flat menu could
   * have shown.
   */
  filingTargets: readonly ArchiveFolder[]
  /** Every volume, for "Assign to…". */
  volumes: readonly VolumeSummary[]
  onClose: () => void

  onOpenFolder: (id: string) => void
  onRenameFolder: (folder: ArchiveFolder) => void
  onDeleteFolder: (folder: ArchiveFolder) => void
  onRestoreFolder: (folder: ArchiveFolder) => void
  onPurgeFolder: (folder: ArchiveFolder) => void
  onNewProject: (folder: ArchiveFolder) => void

  onOpenProject: (id: string) => void
  onOpenInLive: (id: string) => void
  onFileProject: (projectId: string, folderId: string | null) => void
  onAssignVolume: (projectId: string, volumeId: string | null) => void
  onForgetProject: (project: ProjectSummary) => void
  onTrashProject: (project: ProjectSummary) => void
  onRestoreProject: (project: ProjectSummary) => void
  onPurgeProject: (project: ProjectSummary) => void

  onEditVolume: (volume: VolumeSummary) => void
  onDeleteVolume: (volume: VolumeSummary) => void

  onToggleFavourite: (target: MenuTarget) => void
  onReveal: (path: string) => void
}

/**
 * The right-click menu for folders, projects and volumes.
 *
 * Three menus in one component because the three targets share a shape: a
 * heading naming the thing, its verbs, then the destructive ones below a rule.
 * The panel itself — placement and dismissal — belongs to `MenuSurface`, which
 * the dossier's final-master menu draws on too.
 */
export function ContextMenu(props: ContextMenuProps): ReactNode {
  const { target, onClose } = props

  return (
    <MenuSurface x={target.x} y={target.y} onClose={onClose}>
      {target.kind === 'folder' ? <FolderItems {...props} folder={target.folder} /> : null}
      {target.kind === 'project' ? <ProjectItems {...props} project={target.project} /> : null}
      {target.kind === 'volume' ? <VolumeItems {...props} volume={target.volume} /> : null}
    </MenuSurface>
  )
}

/**
 * Walks the tree to any depth, one level at a time.
 *
 * This was a flat list of every folder by bare name, in reading order. That
 * survived while the tree was two levels deep and stopped surviving the moment
 * it became `Projects\<category>\<genre|artist>\<folder>` — a wall of names
 * in which three folders called `Misc` are indistinguishable, and which grows
 * without limit as the operator subdivides.
 *
 * Drilling in place rather than flying out sideways. A context menu is already
 * positioned against a screen edge and a nested flyout has to solve that again
 * for every level; replacing the contents keeps the menu where the operator
 * right-clicked. Every level offers *both* — walk further in, or file here —
 * because a genre is as legitimate a destination as anything under it.
 */
function FilingPicker({
  folders,
  currentFolderId,
  onFile
}: {
  folders: readonly ArchiveFolder[]
  currentFolderId: string | null
  onFile: (folderId: string | null) => void
}): ReactNode {
  const [browsing, setBrowsing] = useState<string | null>(null)

  const here = browsing ? (folders.find((entry) => entry.id === browsing) ?? null) : null
  const children = folders.filter((entry) => entry.parentId === browsing)

  return (
    <div className={styles.menuScroll}>
      {here ? (
        <>
          <Item
            label={`← ${
              here.parentId
                ? (folders.find((entry) => entry.id === here.parentId)?.name ?? 'Back')
                : 'All categories'
            }`}
            onClick={() => setBrowsing(here.parentId)}
          />
          <Item
            label={`File into ${here.name}`}
            swatch={here.colour}
            disabled={here.id === currentFolderId}
            onClick={() => onFile(here.id)}
          />
        </>
      ) : (
        <Item
          label="Take off the shelf"
          disabled={currentFolderId === null}
          onClick={() => onFile(null)}
        />
      )}

      {children.length === 0 ? (
        <Item label={here ? 'Nothing inside' : 'No categories yet'} disabled />
      ) : (
        children.map((folder) => {
          const hasChildren = folders.some((entry) => entry.parentId === folder.id)
          return (
            <Item
              key={folder.id}
              // The chevron is the whole affordance: it says this row goes
              // deeper rather than files here, which is the one thing the flat
              // list could never express.
              label={hasChildren ? `${folder.name}  ›` : folder.name}
              swatch={folder.colour}
              disabled={!hasChildren && folder.id === currentFolderId}
              onClick={() => (hasChildren ? setBrowsing(folder.id) : onFile(folder.id))}
            />
          )
        })
      )}
    </div>
  )
}

function FolderItems({
  folder,
  onOpenFolder,
  onNewProject,
  onRenameFolder,
  onDeleteFolder,
  onRestoreFolder,
  onPurgeFolder,
  onToggleFavourite,
  onReveal
}: ContextMenuProps & { folder: ArchiveFolder }): ReactNode {
  // A binned folder gets the same treatment as a binned project: the only
  // question worth asking is whether it comes back.
  if (folder.trashedAt !== null) {
    return (
      <>
        <MenuLabel>{folder.name}</MenuLabel>
        <Item label="Restore" onClick={() => onRestoreFolder(folder)} />
        <Item label="Show in Explorer" onClick={() => onReveal(folder.path)} />

        <MenuDivider />

        <Item label="Delete permanently" danger onClick={() => onPurgeFolder(folder)} />
      </>
    )
  }

  return (
    <>
      <MenuLabel>{folder.name}</MenuLabel>

      <Item label="Open" onClick={() => onOpenFolder(folder.id)} />
      <Item label="New project here" onClick={() => onNewProject(folder)} />
      <Item label="Rename and recolour" onClick={() => onRenameFolder(folder)} />
      <Item
        label={folder.favourite ? 'Remove favourite' : 'Favourite'}
        onClick={() => onToggleFavourite({ kind: 'folder', folder, x: 0, y: 0 })}
      />
      <Item label="Show in Explorer" onClick={() => onReveal(folder.path)} />

      <MenuDivider />

      <Item label="Delete to the bin" danger onClick={() => onDeleteFolder(folder)} />
    </>
  )
}

function ProjectItems({
  project,
  filingTargets,
  volumes,
  onOpenProject,
  onOpenInLive,
  onFileProject,
  onAssignVolume,
  onForgetProject,
  onTrashProject,
  onRestoreProject,
  onPurgeProject,
  onToggleFavourite,
  onReveal
}: ContextMenuProps & { project: ProjectSummary }): ReactNode {
  /*
   * A binned project gets a different menu entirely, not a longer one.
   *
   * Filing it, assigning it to a volume or opening it in Ableton are all
   * meaningless for something the operator has thrown away — the only two
   * questions worth asking are whether it comes back or goes for good.
   */
  if (project.trashedAt !== null) {
    return (
      <>
        <MenuLabel>{project.name}</MenuLabel>

        <Item label="Restore" onClick={() => onRestoreProject(project)} />
        <Item label="Show in Explorer" onClick={() => onReveal(project.path)} />

        <MenuDivider />

        <Item label="Delete permanently" danger onClick={() => onPurgeProject(project)} />
      </>
    )
  }

  return (
    <>
      <MenuLabel>{project.name}</MenuLabel>

      <Item label="Open in Ableton" onClick={() => onOpenInLive(project.id)} />
      <Item label="Open record" onClick={() => onOpenProject(project.id)} />
      <Item
        label={project.favourite ? 'Remove favourite' : 'Favourite'}
        onClick={() => onToggleFavourite({ kind: 'project', project, x: 0, y: 0 })}
      />
      <Item label="Show in Explorer" onClick={() => onReveal(project.path)} />

      <MenuDivider />
      <MenuLabel>File to</MenuLabel>

      <FilingPicker
        folders={filingTargets}
        currentFolderId={project.folderId}
        onFile={(folderId) => onFileProject(project.id, folderId)}
      />

      <MenuDivider />
      <MenuLabel>Part of</MenuLabel>

      <div className={styles.menuScroll}>
        <Item
          label="Stands alone"
          disabled={project.volumeId === null}
          onClick={() => onAssignVolume(project.id, null)}
        />

        {volumes.length === 0 ? (
          <Item label="No volumes yet" disabled />
        ) : (
          volumes.map((volume) => (
            <Item
              key={volume.id}
              label={`${volume.title} · ${VOLUME_KIND_LABEL[volume.kind]}`}
              swatch={volume.colour}
              disabled={volume.id === project.volumeId}
              onClick={() => onAssignVolume(project.id, volume.id)}
            />
          ))
        )}
      </div>

      <MenuDivider />

      {/*
        Two removals, deliberately worded to be hard to confuse. FORGET is the
        safe one and comes first; DELETE is crimson and says where the folder
        goes, because "delete" on its own reads as unrecoverable and this is not.
      */}
      <Item label="Forget — keep the files" onClick={() => onForgetProject(project)} />
      <Item label="Delete to the bin" danger onClick={() => onTrashProject(project)} />
    </>
  )
}

function VolumeItems({
  volume,
  onEditVolume,
  onDeleteVolume,
  onToggleFavourite
}: ContextMenuProps & { volume: VolumeSummary }): ReactNode {
  return (
    <>
      <MenuLabel>{volume.title}</MenuLabel>

      <Item label="Edit" onClick={() => onEditVolume(volume)} />
      <Item
        label={volume.favourite ? 'Remove favourite' : 'Favourite'}
        onClick={() => onToggleFavourite({ kind: 'volume', volume, x: 0, y: 0 })}
      />

      <MenuDivider />

      {/*
        Not marked danger, and not worded as a deletion of anything real: a
        volume owns no files, so dissolving one frees its tracks rather than
        removing them. The label says so.
      */}
      <Item
        label={
          volume.trackCount > 0
            ? `Dissolve — frees ${volume.trackCount} track${volume.trackCount === 1 ? '' : 's'}`
            : 'Dissolve'
        }
        onClick={() => onDeleteVolume(volume)}
      />
    </>
  )
}
