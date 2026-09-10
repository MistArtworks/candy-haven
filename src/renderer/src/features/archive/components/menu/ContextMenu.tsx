import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from 'react'
import type { ProjectSummary } from '@shared/domain/projects'
import type { ArchiveFolder } from '@shared/domain/stacks'
import type { VolumeSummary } from '@shared/domain/volumes'
import { Portal } from '@renderer/components/primitives/Portal'
import { VOLUME_KIND_LABEL } from '@shared/domain/volumes.constants'
import styles from '../stacks/stacks.module.scss'

/** What was right-clicked, and where. */
export type MenuTarget =
  | { kind: 'folder'; folder: ArchiveFolder; x: number; y: number }
  | { kind: 'project'; project: ProjectSummary; x: number; y: number }
  | { kind: 'volume'; volume: VolumeSummary; x: number; y: number }

export interface ContextMenuProps {
  target: MenuTarget
  /** Every folder, in reading order, for "File to…". */
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
 * Built in the renderer rather than through Electron's native `Menu.popup`,
 * which the app already installs for text fields. Two reasons: the native menu
 * cannot render a colour swatch beside each destination in the "File to…" list,
 * and a native menu on Windows is drawn in the system's own chrome — a plain
 * grey rectangle in the middle of a page whose entire premise is that it is a
 * console from somewhere else.
 *
 * The existing native handler bails out on targets that are neither editable
 * nor selected text, so it does not fight this.
 */
export function ContextMenu(props: ContextMenuProps): ReactNode {
  const { target, onClose } = props
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: target.x, y: target.y })

  // Dismiss on anything that is not a click inside the menu. `pointerdown`
  // rather than `click` so the menu is gone before whatever was underneath it
  // starts reacting.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onClose)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  // Nudge back inside the viewport when opened near an edge — measured after
  // layout, because the menu's height depends on how many folders exist.
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const { width, height } = element.getBoundingClientRect()
    setPosition({
      x: Math.min(target.x, window.innerWidth - width - 8),
      y: Math.min(target.y, window.innerHeight - height - 8)
    })
  }, [target.x, target.y])

  const style = { left: position.x, top: position.y } as CSSProperties

  return (
    <Portal>
      <div ref={ref} className={styles.menu} style={style} role="menu">
        {target.kind === 'folder' ? <FolderItems {...props} folder={target.folder} /> : null}
        {target.kind === 'project' ? <ProjectItems {...props} project={target.project} /> : null}
        {target.kind === 'volume' ? <VolumeItems {...props} volume={target.volume} /> : null}
      </div>
    </Portal>
  )
}

function Item({
  label,
  onClick,
  disabled,
  danger,
  swatch
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  swatch?: string
}): ReactNode {
  return (
    <button
      type="button"
      className={styles.menuItem}
      role="menuitem"
      disabled={disabled}
      data-danger={danger || undefined}
      style={swatch ? ({ '--folder-colour': swatch } as CSSProperties) : undefined}
      onClick={onClick}
    >
      <span>{label}</span>
      {swatch ? <span className={styles.menuSwatch} aria-hidden="true" /> : null}
    </button>
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
        <span className={styles.menuLabel}>{folder.name}</span>
        <Item label="Restore" onClick={() => onRestoreFolder(folder)} />
        <Item label="Show in Explorer" onClick={() => onReveal(folder.path)} />

        <div className={styles.menuDivider} />

        <Item label="Delete permanently" danger onClick={() => onPurgeFolder(folder)} />
      </>
    )
  }

  return (
    <>
      <span className={styles.menuLabel}>{folder.name}</span>

      <Item label="Open" onClick={() => onOpenFolder(folder.id)} />
      <Item label="New project here" onClick={() => onNewProject(folder)} />
      <Item label="Rename and recolour" onClick={() => onRenameFolder(folder)} />
      <Item
        label={folder.favourite ? 'Remove favourite' : 'Favourite'}
        onClick={() => onToggleFavourite({ kind: 'folder', folder, x: 0, y: 0 })}
      />
      <Item label="Show in Explorer" onClick={() => onReveal(folder.path)} />

      <div className={styles.menuDivider} />

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
        <span className={styles.menuLabel}>{project.name}</span>

        <Item label="Restore" onClick={() => onRestoreProject(project)} />
        <Item label="Show in Explorer" onClick={() => onReveal(project.path)} />

        <div className={styles.menuDivider} />

        <Item label="Delete permanently" danger onClick={() => onPurgeProject(project)} />
      </>
    )
  }

  return (
    <>
      <span className={styles.menuLabel}>{project.name}</span>

      <Item label="Open in Ableton" onClick={() => onOpenInLive(project.id)} />
      <Item label="Open record" onClick={() => onOpenProject(project.id)} />
      <Item
        label={project.favourite ? 'Remove favourite' : 'Favourite'}
        onClick={() => onToggleFavourite({ kind: 'project', project, x: 0, y: 0 })}
      />
      <Item label="Show in Explorer" onClick={() => onReveal(project.path)} />

      <div className={styles.menuDivider} />
      <span className={styles.menuLabel}>File to</span>

      <div className={styles.menuScroll}>
        <Item
          label="Take off the shelf"
          disabled={project.folderId === null}
          onClick={() => onFileProject(project.id, null)}
        />

        {filingTargets.length === 0 ? (
          <Item label="No folders yet" disabled />
        ) : (
          filingTargets.map((folder) => (
            <Item
              key={folder.id}
              label={folder.name}
              swatch={folder.colour}
              disabled={folder.id === project.folderId}
              onClick={() => onFileProject(project.id, folder.id)}
            />
          ))
        )}
      </div>

      <div className={styles.menuDivider} />
      <span className={styles.menuLabel}>Part of</span>

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

      <div className={styles.menuDivider} />

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
      <span className={styles.menuLabel}>{volume.title}</span>

      <Item label="Edit" onClick={() => onEditVolume(volume)} />
      <Item
        label={volume.favourite ? 'Remove favourite' : 'Favourite'}
        onClick={() => onToggleFavourite({ kind: 'volume', volume, x: 0, y: 0 })}
      />

      <div className={styles.menuDivider} />

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
