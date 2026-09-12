import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode
} from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useSettings } from '@renderer/hooks/useSettings'
import { AnimatePresence, motion } from 'motion/react'
import type {
  ProjectCategory,
  ProjectQuery,
  ProjectStage,
  ProjectSummary,
  ProjectViewMode
} from '@shared/domain/projects'
import type { ArchiveFolder } from '@shared/domain/stacks'
import type { ArchiveLens, FolderKind } from '@shared/domain/stacks.constants'
import {
  VISIBLE_ARCHIVE_LENSES,
  ARCHIVE_LENS_LABEL,
  FOLDER_KIND_LABEL,
  allowedChildKinds,
  isFolderLens
} from '@shared/domain/stacks.constants'
import type { DeliverableKind } from '@shared/domain/releases'
import type { VolumeKind, VolumeSummary } from '@shared/domain/volumes'
import { VOLUME_KIND_LABEL } from '@shared/domain/volumes.constants'
import { PROJECT_CATEGORY_LABEL, PROJECT_VIEW_MODES } from '@shared/domain/projects.constants'
import { getSection } from '@shared/domain/navigation'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { SkeletonRows, SkeletonTiles } from '@renderer/components/primitives/Skeleton'
import { Button } from '@renderer/components/primitives/Button'
import { formatBytes } from '@renderer/lib/format'
import { gridVariants } from '@renderer/motion/transitions'
import { useProjectMutations, useProjectRegistry, useScanState } from '@renderer/hooks/useProjects'
import { useArchiveSetup, useStacksMutations, useStacksTree } from '@renderer/hooks/useStacks'
import { useVolumeMutations, useVolumes } from '@renderer/hooks/useVolumes'
import { useTagMutations } from '@renderer/hooks/useTags'
import { useReleaseMutations, useReleases } from '@renderer/hooks/useReleases'
import { RegisterControls, type RegisterFilters } from './components/RegisterControls'
import { ProjectListView } from './components/ProjectListView'
import { ProjectBoardView } from './components/ProjectBoardView'
import { ProjectDossier } from './components/ProjectDossier'
import { ScanPanel } from './components/ScanPanel'
import { IntakeView } from './components/IntakeView'
import { TagManagerDialog } from './components/tags/TagManagerDialog'
import { ArchiveGlyph, type ArchiveGlyphName } from './components/icons/ArchiveGlyph'
import { ViewToggle } from './components/ViewToggle'
import { SetupGate } from './components/setup/SetupGate'
import { TileGrid, type Tile } from './components/tiles/TileGrid'
import { describeFolder } from './components/tiles/describe'
import { FolderTrail } from './components/stacks/FolderTrail'
import { FolderDialog } from './components/stacks/FolderDialog'
import { ConfirmDialog } from './components/stacks/ConfirmDialog'
import { ProjectDialog } from './components/dialogs/ProjectDialog'
import { VolumeDialog } from './components/dialogs/VolumeDialog'
import { ReleaseBoard } from './components/releases/ReleaseBoard'
import { UnfiledPanel } from './components/panels/UnfiledPanel'
import { ContextMenu, type MenuTarget } from './components/menu/ContextMenu'
import {
  PROJECT_DRAG_TYPE,
  beginDrag,
  hasLeftElement,
  isDragging,
  readDrag
} from './components/stacks/dnd'
import { childCountsOf, childrenOf, subtreeOf, trailTo } from './components/stacks/tree'
import { useHotkeys } from '@renderer/hotkeys/useHotkeys'
import type { Hotkey } from '@renderer/hotkeys/registry'
import { formatKey, formatStamp, formatTempo } from './lib/present'
import styles from './ArchivePage.module.scss'

const INITIAL_FILTERS: RegisterFilters = {
  search: '',
  stages: [],
  categories: [],
  tags: [],
  favouritesOnly: false,
  includeMissing: false,
  sort: 'recent'
}

type FolderDialogState =
  { mode: 'create'; parentId: string | null } | { mode: 'rename'; folder: ArchiveFolder }

type VolumeDialogState =
  { mode: 'create'; kind: VolumeKind } | { mode: 'edit'; volume: VolumeSummary }

/** A destructive action awaiting confirmation. */
type ConfirmState =
  | { kind: 'folder'; folder: ArchiveFolder; projects: number }
  | { kind: 'trash'; project: ProjectSummary }
  | { kind: 'forget'; project: ProjectSummary }
  | { kind: 'purge'; project: ProjectSummary }
  | { kind: 'purgeFolder'; folder: ArchiveFolder }
  | { kind: 'volume'; volume: VolumeSummary }

/**
 * Debounces a value so typing in the search field does not issue a query per
 * keystroke. The registry query runs against the local archive and is cheap,
 * but each result replaces the rendered list — and a list that re-sorts on
 * every character is unusable regardless of how fast it returns.
 */
function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return settled
}

/**
 * ARCHIVE — the project registry.
 *
 * Everything the operator has made: created here rather than merely discovered,
 * filed on shelves that are real directories, tracked through the production
 * pipeline, and carried through to a release folder of finished files.
 *
 * Two axes, and keeping them separate is what stops this page becoming a
 * settings screen. The **lens** decides what is in scope: STACKS browses the
 * filing tree the operator builds, INTAKE what is elsewhere on disk,
 * VOLUMES the albums and EPs, RELEASES what is going out, ALL the register
 * flat, and BIN what has been deleted.
 * The **view** decides how whatever is in scope gets drawn — the ledger, the
 * plate view, or the pipeline board where the stage is edited by moving the
 * project itself.
 *
 * Nothing is drawn until the department is set up. See `SetupGate` for why that
 * is a gate rather than an empty state.
 */
export function ArchivePage(): ReactNode {
  const section = getSection('archive')

  const [filters, setFilters] = useState<RegisterFilters>(INITIAL_FILTERS)
  /*
   * Icons by default, not the ledger.
   *
   * A shelf is browsed before it is audited: the first question is "what is in
   * here", which a grid of objects answers at a glance and a table of figures
   * does not. LIST is still one click away for when the figures are the point.
   */
  const [view, setView] = useState<ProjectViewMode>('grid')
  const [notice, setNotice] = useState<string | null>(null)
  const [managingTags, setManagingTags] = useState(false)
  const [folderDialog, setFolderDialog] = useState<FolderDialogState | null>(null)
  const [projectDialog, setProjectDialog] = useState<ArchiveFolder | null>(null)
  const [volumeDialog, setVolumeDialog] = useState<VolumeDialogState | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuTarget | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  /** A project is being dragged over the shelf itself, not over a tile. */
  const [shelfDrop, setShelfDrop] = useState(false)
  /**
   * The tile a single click marked.
   *
   * Not in the URL, unlike the open folder or dossier: a selection is a
   * momentary pointing gesture, not somewhere the operator navigated to, and
   * putting it in history would make the back gesture step through highlights.
   */
  const queryClient = useQueryClient()
  const settings = useSettings()

  /*
   * Where INTAKE browses from: the configured source locations,
   * and nothing else.
   *
   * The filing root was included at first, reasoning that a project sitting
   * loose in it but outside the wrapper is unfiled in every sense that matters.
   * True, and not worth what it cost: the filing root's only contents are
   * almost always the wrapper itself, so it contributed a tab that browsed the
   * archive the operator is migrating *into*. Migration asks "what have I got
   * elsewhere" — the answer is the locations they added for exactly that.
   *
   * A stray project directly in the filing root is still found by the scan and
   * still filed from the shelves; it just is not browsed for here.
   */
  const intakeRoots = useMemo(
    () => [...new Set(settings?.workspace.satelliteRoots ?? [])],
    [settings?.workspace.satelliteRoots]
  )

  const [tileSelection, setTileSelection] = useState<string | null>(null)

  /*
   * Everything picked out for a bulk move, projects and folders together.
   *
   * Separate from `tileSelection`, which is the single tile the keyboard is
   * on. A set of ids is not a cursor: one says "act on these", the other says
   * "you are here", and collapsing them would make arrowing through a shelf
   * silently change what the next drag would move.
   */
  const [marked, setMarked] = useState<ReadonlySet<string>>(() => new Set())

  const toggleMarked = useCallback((id: string, additive: boolean) => {
    setMarked((current) => {
      if (!additive) return current.has(id) && current.size === 1 ? new Set() : new Set([id])
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearMarked = useCallback(() => setMarked(new Set()), [])

  /*
   * The open dossier, the folder being browsed, the open volume and the open
   * release all live in the URL rather than in component state.
   *
   * A link needs somewhere to point, and holding them here also means the back
   * gesture closes the dossier and then walks back up the tree, instead of
   * leaving the department — which is what the operator expects of something
   * that opened from a link.
   */
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('project')
  const folderId = searchParams.get('folder')
  const volumeId = searchParams.get('volume')
  const releaseId = searchParams.get('release')
  const rawLens = searchParams.get('lens')
  /*
   * A hidden lens in the URL falls back to the default rather than being
   * honoured. RELEASES is stood down (see HIDDEN_ARCHIVE_LENSES) and an old
   * bookmark or a back gesture would otherwise open a lens with no way off it
   * — the rail no longer draws a button to leave by.
   */
  const lens: ArchiveLens = VISIBLE_ARCHIVE_LENSES.includes(rawLens as ArchiveLens)
    ? (rawLens as ArchiveLens)
    : 'stacks'

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (value) next.set(key, value)
          else next.delete(key)
          return next
        },
        // Replace rather than push: opening and closing a dossier should not
        // build a history stack the operator has to walk back out of.
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const selectProject = useCallback((id: string | null) => setParam('project', id), [setParam])
  const openFolder = useCallback((id: string | null) => setParam('folder', id), [setParam])
  const openVolume = useCallback((id: string | null) => setParam('volume', id), [setParam])
  const openRelease = useCallback((id: string | null) => setParam('release', id), [setParam])

  const changeLens = useCallback(
    (next: ArchiveLens) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current)
          params.set('lens', next)
          // Leaving a lens abandons whatever was open inside it. Keeping it
          // would mean returning to a shelf the operator visibly stepped out of.
          if (next !== 'stacks') params.delete('folder')
          if (next !== 'volumes') params.delete('volume')
          if (next !== 'releases') params.delete('release')
          return params
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  // ------------------------------------------------------------------ data

  const { data: setup } = useArchiveSetup()
  const ready = setup?.ready ?? false

  /*
   * Everything that would write to disk is inert until the archive exists.
   *
   * The page itself is not: it used to be hidden behind a full-screen setup
   * sheet, which meant a new operator's first sight of the department was a
   * form with no context for what it was configuring. Now the shelves, the
   * lenses and the panels are all visible and simply cannot be acted on, and
   * the setup panel sits at the foot of the page where it can be read against
   * the thing it sets up.
   *
   * The services refuse these calls regardless — this only stops the operator
   * discovering that by being told off.
   */
  const locked = !ready

  /*
   * Read before the query is assembled, not alongside it: the register's
   * folder scope now depends on the shape of the tree. See `subtree` below.
   */
  const { data: stacksTree } = useStacksTree(ready)

  const search = useDebounced(filters.search, 180)
  const browsing = isFolderLens(lens)

  /*
   * Filtering a genre searches the whole shelf; browsing one does not.
   *
   * The distinction is the tag filter. With none on, STACKS is a file
   * browser and should list exactly what is filed at this level. The moment a
   * tag is on, the operator is asking a question of the shelf — "what in
   * Dubstep is Dark" — and answering it about one level only would report
   * nothing for any genre that has been subdivided, which is precisely the
   * library large enough to need tags in the first place.
   *
   * `stacks` is read below, so this reaches for the raw tree rather than the
   * memoised `folders`; the tree is tens of entries and this recomputes only
   * when the open folder or the filter changes.
   */
  const scoped = browsing && folderId !== null && filters.tags.length > 0
  const subtree = useMemo(
    () => (scoped ? subtreeOf(stacksTree?.folders ?? [], folderId) : null),
    [scoped, stacksTree?.folders, folderId]
  )

  /*
   * INTAKE ignores the filters entirely.
   *
   * Its panes list directories on disk, and the register is consulted only to
   * answer "is this folder one I already know about" — which decides whether a
   * row can be dragged. A filter left on from another lens cannot narrow what
   * the pane shows, but it *can* narrow that lookup, and an indexed project
   * would then be labelled NOT INDEXED and refuse to be picked up. The controls
   * are hidden there for the same reason; this handles a filter set elsewhere
   * and still active on arrival.
   */
  const filtering = lens !== 'unfiled'

  const query = useMemo<ProjectQuery>(
    () => ({
      search: filtering ? search || undefined : undefined,
      stages: filtering && filters.stages.length > 0 ? filters.stages : undefined,
      categories: filtering && filters.categories.length > 0 ? filters.categories : undefined,
      tagIds: filtering && filters.tags.length > 0 ? filters.tags : undefined,
      favouritesOnly: (filtering && filters.favouritesOnly) || undefined,
      includeMissing: (filtering && filters.includeMissing) || undefined,
      sort: filters.sort,
      /*
       * While browsing, the register beneath the tiles shows only what is filed
       * at this exact level — including `null` at the root, which is why this
       * is set unconditionally rather than only when a folder is open. The root
       * register is not rendered at all (see below), because "filed nowhere" is
       * exactly what the UNORGANISED panel already shows.
       */
      // A subtree search replaces the single-level scope rather than adding
      // to it — see `subtree` above and `ProjectQuery.folderIds`.
      ...(browsing ? (subtree ? { folderIds: subtree } : { folderId }) : {}),
      // VOLUMES lists one volume's tracks once opened.
      ...(lens === 'volumes' && volumeId !== null ? { volumeId } : {}),
      /*
       * INTAKE takes the *whole* register, not the unfiled slice.
       *
       * It used to ask for `folderId: null`, which was right while the lens
       * drew a list of unfiled projects and wrong the moment it became two
       * directory panes. The left pane matches browsed folders against records
       * by path — a filed project still exists on disk and must still be
       * recognised — and the right pane draws what is filed on the shelf it is
       * standing on, which a query excluding filed projects can never return.
       *
       * The symptom was a drop that worked perfectly and then showed nothing:
       * the files moved, the record took its folder, and the pane that had
       * just filed it could not see it.
       */
      // The bin is a place, not a filter — see `ProjectQuerySchema.trashed`.
      ...(lens === 'bin' ? { trashed: true } : {})
    }),
    [filtering, search, filters, browsing, folderId, subtree, lens, volumeId]
  )

  const { data: registry, isLoading } = useProjectRegistry(query)
  const stacks = stacksTree
  const { data: volumes } = useVolumes(ready)
  const { data: releases } = useReleases(ready)
  const scan = useScanState()

  const mutations = useProjectMutations()
  const tagMutations = useTagMutations()
  const stackMutations = useStacksMutations()
  const volumeMutations = useVolumeMutations()
  const releaseMutations = useReleaseMutations()

  const scanning =
    scan.phase === 'walking' || scan.phase === 'analysing' || scan.phase === 'persisting'

  // Memoised so the empty fallback is not a new array on every render, which
  // would defeat the tile and menu derivations that depend on it.
  const projects = useMemo(() => registry?.projects ?? [], [registry?.projects])
  const total = useMemo(
    () => Object.values(registry?.stageCounts ?? {}).reduce((sum, count) => sum + count, 0),
    [registry?.stageCounts]
  )

  // Memoised so the empty fallback is not a new array on every render, which
  // would defeat every derivation below it.
  const folders = useMemo(() => stacks?.folders ?? [], [stacks?.folders])
  const allVolumes = useMemo(() => volumes ?? [], [volumes])
  const allReleases = useMemo(() => releases ?? [], [releases])

  const binnedFolders = useMemo(() => stacks?.trashed ?? [], [stacks?.trashed])
  const visibleFolders = useMemo(() => childrenOf(folders, folderId), [folders, folderId])
  const childCounts = useMemo(() => childCountsOf(folders), [folders])
  const trail = useMemo(() => trailTo(folders, folderId), [folders, folderId])

  /**
   * Every folder, in reading order, as a filing destination.
   *
   * No longer filtered by depth: a genre holds projects just as a folder inside
   * it does. Ordered by name within each level — the menu walks the tree by
   * `parentId` now rather than flattening it, so path order no longer has to
   * stand in for structure.
   */
  const filingTargets = useMemo(
    () => [...folders].sort((a, b) => a.name.localeCompare(b.name)),
    [folders]
  )

  /**
   * Whether the main panel draws a register at all.
   *
   * RELEASES draws its own board and VOLUMES at the top level draws tiles; the
   * STACKS root draws only shelves, because "filed here" there means "filed
   * nowhere" and that work lives in INTAKE.
   *
   * INTAKE does not draw one either. It browses directories, so it takes its
   * own narrowed toggle — LIST and ICONS, no BOARD — rather than this one,
   * which would offer a board of stages over a folder that has none.
   */
  const drawsRegister =
    lens === 'all' ||
    lens === 'bin' ||
    (lens === 'volumes' && volumeId !== null) ||
    (browsing && folderId !== null)

  const currentFolder = trail.at(-1) ?? null

  /*
   * What the add tile offers is named after what may actually be made here.
   *
   * A category holds genres *and* artists, so at that level the tile cannot
   * name one — it says "New shelf" and the dialog asks which. Everywhere else
   * exactly one kind is legal and the tile says so outright.
   */
  const addableKinds = allowedChildKinds(currentFolder?.kind ?? null)
  const addFolderLabel =
    addableKinds.length === 1
      ? `New ${FOLDER_KIND_LABEL[addableKinds[0]].toLowerCase()}`
      : 'New shelf'

  // Standing inside any folder is enough; only the tree root is not a folder.
  /*
   * A project needs a genre, an artist or a folder under one — not a category.
   *
   * A category divides the operator's *filing*, not their work: it holds kinds
   * of shelf, and a project sitting beside genres at that level would be the
   * one thing in the tree with no answer to "what is this filed as". The rule
   * mirrors VALID_CHILD_KINDS, which already refuses to put a project's
   * possible parents anywhere else.
   */
  const canCreateProjectHere = currentFolder !== null && currentFolder.kind !== 'category'

  // ------------------------------------------------------------- reporting

  /** Surfaces a refusal from main, which is where every rule lives. */
  const report = useCallback((error: Error & { hint?: string | null }) => {
    setNotice(error.hint ? `${error.message} ${error.hint}` : error.message)
  }, [])

  const reportToDialog = useCallback((error: Error & { hint?: string | null }) => {
    setDialogError(error.hint ? `${error.message} ${error.hint}` : error.message)
  }, [])

  const runScan = useCallback(
    (force = false) => {
      setNotice(null)
      window.candy.projects.scan(force).catch(report)
    },
    [report]
  )

  const cancelScan = useCallback(() => {
    void window.candy.projects.cancelScan()
  }, [])

  const changeStage = useCallback(
    (id: string, stage: ProjectStage) => {
      setNotice(null)
      mutations.patch.mutate({ id, patch: { stage } }, { onError: report })
    },
    [mutations.patch, report]
  )

  // ---------------------------------------------------------------- filing

  /*
   * One drop, however many things were picked up.
   *
   * A drag that starts on a marked tile carries the whole marked set; a drag
   * that starts anywhere else carries just that one thing and leaves the marks
   * alone. That rule is what stops a bulk move happening by accident — the
   * operator has to have marked the tile they then drag.
   *
   * `fileMany` is used even for one item, so the partial-failure path is the
   * same code in both cases rather than a rarely-exercised branch.
   */
  const fileMany = useCallback(
    (
      projectIds: readonly string[],
      folderIds: readonly string[],
      targetFolderId: string | null
    ) => {
      setNotice(null)
      setMenu(null)

      void window.candy.projects
        .fileMany([...projectIds], [...folderIds], targetFolderId)
        .then(({ moved, failures, renamed }) => {
          clearMarked()
          void queryClient.invalidateQueries({ queryKey: ['stacks'] })
          void queryClient.invalidateQueries({ queryKey: ['projects'] })
          // The directory listing INTAKE is browsing has just changed on disk:
          // whatever moved is no longer in the folder it was dragged out of.
          // Without this the source pane keeps showing it, and shows it as
          // NOT INDEXED, because its record now points into the archive.
          void queryClient.invalidateQueries({ queryKey: ['browse'] })

          if (failures.length === 0 && renamed.length === 0) return

          /*
           * Both outcomes are named rather than counted.
           *
           * "Three could not be moved" sends the operator hunting; the names
           * say which, and the reason says why. A rename is reported on the
           * same principle and for a stronger reason — a directory on their
           * disk is now called something else, and the only alternative to
           * saying so here is them finding out weeks later.
           */
          const parts: string[] = [`Moved ${moved}.`]

          if (renamed.length > 0) {
            parts.push(
              `Renamed ${renamed
                .map((entry) => `${entry.from} → ${entry.to}`)
                .join('; ')} — the name was already on that shelf.`
            )
          }

          if (failures.length > 0) {
            parts.push(
              `Could not move ${failures
                .map((entry) => `${entry.name} — ${entry.reason}`)
                .join('; ')}`
            )
          }

          setNotice(parts.join(' '))
        })
        .catch(report)
    },
    [clearMarked, queryClient, report]
  )

  const fileProject = useCallback(
    (projectId: string, targetFolderId: string | null) => {
      setNotice(null)
      setMenu(null)
      stackMutations.file.mutate({ id: projectId, folderId: targetFolderId }, { onError: report })
    },
    [stackMutations.file, report]
  )

  const nestFolder = useCallback(
    (id: string, parentId: string) => {
      setNotice(null)
      stackMutations.update.mutate({ id, patch: { parentId } }, { onError: report })
    },
    [stackMutations.update, report]
  )

  /**
   * Attaching a track to a volume sets its category to match in the same patch.
   *
   * The two are one statement, and the service refuses a half of it. Sending
   * both from here means the operator picks an album from a menu and the track
   * simply becomes an album track, rather than being told it must also say so.
   */
  const assignVolume = useCallback(
    (projectId: string, targetVolumeId: string | null) => {
      setNotice(null)
      setMenu(null)

      const volume = allVolumes.find((entry) => entry.id === targetVolumeId)
      const category: ProjectCategory = volume ? volume.kind : 'single'

      mutations.patch.mutate(
        { id: projectId, patch: { volumeId: targetVolumeId, category } },
        { onError: report }
      )
    },
    [allVolumes, mutations.patch, report]
  )

  const toggleFavourite = useCallback(
    (target: MenuTarget) => {
      setNotice(null)
      setMenu(null)

      if (target.kind === 'folder') {
        stackMutations.update.mutate(
          { id: target.folder.id, patch: { favourite: !target.folder.favourite } },
          { onError: report }
        )
        return
      }

      if (target.kind === 'project') {
        mutations.patch.mutate(
          { id: target.project.id, patch: { favourite: !target.project.favourite } },
          { onError: report }
        )
        return
      }

      volumeMutations.update.mutate(
        { id: target.volume.id, patch: { favourite: !target.volume.favourite } },
        { onError: report }
      )
    },
    [stackMutations.update, mutations.patch, volumeMutations.update, report]
  )

  // --------------------------------------------------------------- dialogs

  const submitFolder = useCallback(
    (name: string, colour: string, kind: FolderKind) => {
      setDialogError(null)
      const done = (): void => setFolderDialog(null)

      if (folderDialog?.mode === 'create') {
        stackMutations.create.mutate(
          { parentId: folderDialog.parentId, name, colour, kind },
          { onSuccess: done, onError: reportToDialog }
        )
        return
      }

      if (folderDialog?.mode === 'rename') {
        stackMutations.update.mutate(
          { id: folderDialog.folder.id, patch: { name, colour } },
          { onSuccess: done, onError: reportToDialog }
        )
      }
    },
    [folderDialog, stackMutations.create, stackMutations.update, reportToDialog]
  )

  const submitProject = useCallback(
    (draft: {
      name: string
      category: ProjectCategory
      volumeId: string | null
      colour: string
    }) => {
      if (!projectDialog) return
      setDialogError(null)

      mutations.create.mutate(
        { folderId: projectDialog.id, ...draft },
        {
          onSuccess: (record) => {
            setProjectDialog(null)
            // Opens straight into the new record: creating a project is the
            // start of working on it, not the end of a filing task.
            selectProject(record.id)
          },
          onError: reportToDialog
        }
      )
    },
    [projectDialog, mutations.create, selectProject, reportToDialog]
  )

  const submitVolume = useCallback(
    (draft: { kind: VolumeKind; title: string; artist: string; colour: string }) => {
      setDialogError(null)
      const done = (): void => setVolumeDialog(null)

      if (volumeDialog?.mode === 'create') {
        volumeMutations.create.mutate(draft, { onSuccess: done, onError: reportToDialog })
        return
      }

      if (volumeDialog?.mode === 'edit') {
        volumeMutations.update.mutate(
          { id: volumeDialog.volume.id, patch: draft },
          { onSuccess: done, onError: reportToDialog }
        )
      }
    },
    [volumeDialog, volumeMutations.create, volumeMutations.update, reportToDialog]
  )

  // ------------------------------------------------------------ destructive

  /**
   * Deleting a folder asks once, then bins the whole shelf.
   *
   * It used to attempt the delete, let the service refuse an occupied folder,
   * and use that refusal as the prompt — a round trip to produce a dialog. That
   * was worth it when confirming meant scattering the contents one level up;
   * now the folder and everything in it go to the bin intact and come back
   * together, so a single plain question is enough.
   */
  const deleteFolder = useCallback(
    (folder: ArchiveFolder) => {
      setNotice(null)
      setMenu(null)
      setConfirm({
        kind: 'folder',
        folder,
        projects: stacks?.counts[folder.id] ?? 0
      })
    },
    [stacks?.counts]
  )

  const restoreFolder = useCallback(
    (folder: ArchiveFolder) => {
      setNotice(null)
      setMenu(null)
      stackMutations.restore.mutate(folder.id, { onError: report })
    },
    [stackMutations.restore, report]
  )

  const runConfirmed = useCallback(() => {
    if (!confirm) return
    const settle = (): void => setConfirm(null)

    if (confirm.kind === 'folder') {
      stackMutations.remove.mutate(confirm.folder.id, {
        onError: report,
        onSuccess: () => {
          // Standing inside a folder that has just gone to the bin would leave
          // the browser pointed at nothing.
          if (folderId === confirm.folder.id) openFolder(confirm.folder.parentId)
        },
        onSettled: settle
      })
      return
    }

    if (confirm.kind === 'purgeFolder') {
      stackMutations.purge.mutate(confirm.folder.id, { onError: report, onSettled: settle })
      return
    }

    if (confirm.kind === 'volume') {
      volumeMutations.remove.mutate(confirm.volume.id, {
        onError: report,
        onSuccess: () => {
          if (volumeId === confirm.volume.id) openVolume(null)
        },
        onSettled: settle
      })
      return
    }

    const closeIfOpen = (): void => {
      if (selectedId === confirm.project.id) selectProject(null)
    }

    if (confirm.kind === 'forget') {
      mutations.forget.mutate(confirm.project.id, {
        onError: report,
        onSuccess: closeIfOpen,
        onSettled: settle
      })
      return
    }

    if (confirm.kind === 'purge') {
      mutations.purge.mutate(confirm.project.id, {
        onError: report,
        onSuccess: closeIfOpen,
        onSettled: settle
      })
      return
    }

    mutations.trash.mutate(confirm.project.id, {
      onError: report,
      onSuccess: closeIfOpen,
      onSettled: settle
    })
  }, [
    confirm,
    stackMutations.remove,
    stackMutations.purge,
    volumeMutations.remove,
    mutations.forget,
    mutations.trash,
    mutations.purge,
    report,
    folderId,
    openFolder,
    volumeId,
    openVolume,
    selectedId,
    selectProject
  ])

  // ------------------------------------------------------------ interaction

  /**
   * Favourite from a tile's corner mark.
   *
   * Resolves the id against all three kinds rather than taking a typed target,
   * because `TileGrid` is deliberately domain-blind — it knows tiles, not
   * folders and volumes — and this is the one place that mapping already lives.
   */
  const favouriteById = useCallback(
    (id: string) => {
      const folder = folders.find((entry) => entry.id === id)
      if (folder) {
        toggleFavourite({ kind: 'folder', folder, x: 0, y: 0 })
        return
      }

      const volume = allVolumes.find((entry) => entry.id === id)
      if (volume) {
        toggleFavourite({ kind: 'volume', volume, x: 0, y: 0 })
        return
      }

      const project = projects.find((entry) => entry.id === id)
      if (project) toggleFavourite({ kind: 'project', project, x: 0, y: 0 })
    },
    [folders, allVolumes, projects, toggleFavourite]
  )

  const restoreProject = useCallback(
    (project: ProjectSummary) => {
      setNotice(null)
      setMenu(null)
      mutations.restore.mutate(project.id, { onError: report })
    },
    [mutations.restore, report]
  )

  /**
   * A drag from a row, in the ledger or the unfiled panel.
   *
   * Honours the marked set on the same rule `TileGrid` uses: dragging a marked
   * row carries every marked row, dragging an unmarked one carries only itself
   * and leaves the marks alone. Without this the two list views could mark a
   * dozen projects and then move exactly one, which is worse than not offering
   * marking at all — the operator has no way to tell it did not take.
   */
  const onProjectDragStart = useCallback(
    (event: DragEvent<HTMLElement>, project: ProjectSummary) => {
      const ids = marked.has(project.id) ? [...marked] : [project.id]
      beginDrag(event, PROJECT_DRAG_TYPE, ids)
    },
    [marked]
  )

  /** Shift-click in a list view. The view resolved the span from its own order. */
  const markRange = useCallback((ids: readonly string[]) => {
    setMarked((current) => new Set([...current, ...ids]))
  }, [])

  const onProjectMenu = useCallback((event: MouseEvent<HTMLElement>, project: ProjectSummary) => {
    event.preventDefault()
    setMenu({ kind: 'project', project, x: event.clientX, y: event.clientY })
  }, [])

  const onTileMenu = useCallback(
    (event: MouseEvent<HTMLElement>, id: string) => {
      event.preventDefault()

      const folder = [...folders, ...binnedFolders].find((entry) => entry.id === id)
      if (folder) {
        setMenu({ kind: 'folder', folder, x: event.clientX, y: event.clientY })
        return
      }

      const volume = allVolumes.find((entry) => entry.id === id)
      if (volume) {
        setMenu({ kind: 'volume', volume, x: event.clientX, y: event.clientY })
        return
      }

      // Project tiles share the grid with folders in the icons view, so the
      // same handler has to resolve all three kinds by id.
      const project = projects.find((entry) => entry.id === id)
      if (project) setMenu({ kind: 'project', project, x: event.clientX, y: event.clientY })
    },
    [folders, binnedFolders, allVolumes, projects]
  )

  // -------------------------------------------------------------- shortcuts

  const searchRef = useRef<HTMLInputElement>(null)

  /*
   * Declared as its own callback rather than inline in the list below.
   *
   * The lint rule that guards refs cannot tell a closure that will run on a
   * keystroke from one that runs during render, so a `useRef` read inside a
   * `useMemo` factory is flagged. An event handler is exactly what this is, and
   * hoisting it says so.
   */
  const focusSearch = useCallback(() => {
    const field = searchRef.current
    if (!field) return
    field.focus()
    // Selected rather than merely focused, so the next keystroke replaces the
    // previous search instead of appending to it.
    field.select()
  }, [])

  /*
   * What the department can be driven by from the keyboard.
   *
   * Registered rather than bound: the provider owns one document listener and
   * the cheatsheet is generated from whatever is currently registered, so this
   * list is the documentation as well as the implementation and the two cannot
   * drift.
   *
   * `whileTyping` is set on all of them because all of them carry Ctrl or Alt,
   * which no text field wants.
   *
   * Lenses take Alt rather than Ctrl because Ctrl+1..6 are the departments, and
   * a shortcut that means "second department" on five pages and "second lens"
   * on this one would be worse than no shortcut.
   */
  const hotkeys = useMemo<Hotkey[]>(() => {
    const group = 'Archive'

    const entries: Hotkey[] = [
      {
        chord: 'ctrl+f',
        label: 'Search the register',
        group,
        // The exception to the rule below: it has to work *from* the search
        // field, or the operator cannot get back to it after tabbing away.
        whileTyping: true,
        run: focusSearch
      },
      {
        chord: 'escape',
        label: 'Close what is open',
        group,
        // Deliberately not `whileTyping`: Escape in a field should leave the
        // field, which the browser already does.
        disabled:
          selectedId === null && menu === null && notice === null && marked.size === 0,
        /*
         * One key, unwound in the order things were put on top of each other:
         * menu, then marks, then the cursor, then the notice.
         *
         * Marks sit above the cursor because they are the more consequential
         * state — a stray Escape that dropped a twelve-project selection while
         * merely deselecting a tile would be the expensive mistake of the two.
         */
        run: () => {
          if (menu !== null) {
            setMenu(null)
            return
          }
          if (marked.size > 0) {
            clearMarked()
            return
          }
          if (selectedId !== null) {
            selectProject(null)
            return
          }
          setNotice(null)
        }
      },
      {
        chord: 'ctrl+a',
        label: 'Mark everything in scope',
        group,
        // `whileTyping` off on purpose, and the one place that rule really
        // earns itself: Ctrl+A in the search field must still select the text.
        disabled: locked || projects.length === 0,
        run: () => {
          const every = projects.every((project) => marked.has(project.id))
          setMarked(every ? new Set() : new Set(projects.map((project) => project.id)))
        }
      },
      {
        chord: 'ctrl+r',
        label: 'Scan for changes',
        group,
        whileTyping: true,
        disabled: locked || scanning,
        run: () => runScan(false)
      },
      {
        chord: 'ctrl+shift+r',
        label: 'Re-read every project',
        group,
        whileTyping: true,
        disabled: locked || scanning,
        run: () => runScan(true)
      },
      {
        chord: 'ctrl+n',
        label: addFolderLabel,
        group,
        whileTyping: true,
        disabled: locked || lens !== 'stacks',
        run: () => {
          setDialogError(null)
          setFolderDialog({ mode: 'create', parentId: folderId })
        }
      },
      {
        chord: 'ctrl+shift+n',
        label: 'New project on this shelf',
        group,
        whileTyping: true,
        // A project needs a shelf. At the root there is nowhere to put it.
        disabled: locked || lens !== 'stacks' || currentFolder === null,
        run: () => {
          if (!currentFolder) return
          setDialogError(null)
          setProjectDialog(currentFolder)
        }
      },
      {
        chord: 'ctrl+b',
        label: 'Favourites only',
        group,
        whileTyping: true,
        run: () =>
          setFilters((current) => ({ ...current, favouritesOnly: !current.favouritesOnly }))
      },
      {
        chord: 'ctrl+e',
        label: 'Cycle list, icons, board',
        group,
        whileTyping: true,
        disabled: lens === 'releases',
        run: () =>
          setView(
            (current) =>
              PROJECT_VIEW_MODES[
                (PROJECT_VIEW_MODES.indexOf(current) + 1) % PROJECT_VIEW_MODES.length
              ]
          )
      },
      {
        chord: 'alt+arrowup',
        label: 'Up one shelf',
        group,
        whileTyping: true,
        disabled: lens !== 'stacks' || currentFolder === null,
        run: () => openFolder(currentFolder?.parentId ?? null)
      }
    ]

    // Built by mapping rather than by pushing into `entries`: the lint rule
    // that guards refs reads a mutating closure as something that might run
    // during render, and there is nothing here worth arguing the point over.
    const lenses: Hotkey[] = VISIBLE_ARCHIVE_LENSES.map((entry, index) => ({
      chord: `alt+${index + 1}`,
      label: ARCHIVE_LENS_LABEL[entry],
      group: 'Archive lenses',
      whileTyping: true,
      run: () => changeLens(entry)
    }))

    return [...entries, ...lenses]
  }, [
    addFolderLabel,
    changeLens,
    currentFolder,
    focusSearch,
    folderId,
    lens,
    locked,
    menu,
    notice,
    openFolder,
    runScan,
    scanning,
    selectProject,
    selectedId,
    marked,
    clearMarked,
    projects
  ])

  useHotkeys(hotkeys)

  // ----------------------------------------------------------------- tiles

  const folderTiles = useMemo<Tile[]>(
    () =>
      visibleFolders.map((folder) => {
        return {
          id: folder.id,
          mark: folder.kind,
          name: folder.name,
          detail: describeFolder(stacks?.counts[folder.id] ?? 0, childCounts[folder.id] ?? 0),
          colour: folder.colour,
          favourite: folder.favourite,
          title: folder.path,
          acceptsProjects: true,
          acceptsFolders: true,
          draggableAs: 'folder'
        }
      }),
    [visibleFolders, stacks?.counts, childCounts]
  )

  /**
   * The projects on the shelf, as tiles beside the folders.
   *
   * Marked `project` regardless of category: the mark says "this is a set you
   * open", and what *kind* of release it belongs to is already on the tile's
   * second line. Varying the mark by category would collide with the disc marks
   * the VOLUMES lens uses for albums and EPs, which are a different object
   * entirely.
   */
  /**
   * Tag id to the tag itself, for captioning tiles.
   *
   * A project summary carries `tagIds` and not the tags, because shipping the
   * whole library on every row would repeat it once per project. The library
   * is already fetched for the filter row, so this is a lookup rather than a
   * second request.
   */
  const tagsById = useMemo(
    () => new Map((registry?.tags ?? []).map((tag) => [tag.id, tag])),
    [registry?.tags]
  )

  const projectTiles = useMemo<Tile[]>(
    () =>
      projects.map((project) => ({
        id: project.id,
        mark: 'project',
        name: project.name,
        /*
         * What the operator actually asks of a shelf at a glance.
         *
         * This was category, mastered-state and size on disk. None of the three
         * answers "which of these is the one I want": every project on a genre
         * shelf is the same category, mastered-state is already on the stage
         * badge, and megabytes say nothing about the music. Tags, tempo and key
         * are what distinguishes one set from the next when the names have
         * stopped being distinguishable — which is exactly the point at which
         * the operator switched to this view.
         *
         * Size has not been lost; the ledger still carries it as a column, and
         * that is the view whose job is figures.
         */
        facets: [
          ...project.tagIds
            .map((id) => tagsById.get(id))
            .filter((tag): tag is NonNullable<typeof tag> => tag !== undefined)
            .map((tag) => ({ label: tag.name, colour: tag.colour })),
          ...(project.tempo !== null
            ? [{ label: `${formatTempo(project.tempo)} BPM`, readout: true }]
            : []),
          // Abbreviated: `C Maj` rather than `C Major`, because this sits beside
          // the tempo on a tile a quarter the width of a dossier.
          ...(project.key ? [{ label: formatKey(project.key, true), readout: true }] : [])
        ],
        // Kept as the fallback for a project with no tags and an unread set —
        // a blank caption would read as a fault rather than as an absence.
        detail: [
          PROJECT_CATEGORY_LABEL[project.category],
          project.hasFinalMaster ? 'MASTERED' : null,
          formatBytes(project.sizeBytes)
        ]
          .filter(Boolean)
          .join(' · '),
        colour: project.colour,
        favourite: project.favourite,
        title: project.path,
        coverPath: project.coverPath,
        // A project can be dragged onto a folder, but nothing can be dropped
        // onto a project — it is a leaf.
        draggableAs: 'project'
      })),
    [projects, tagsById]
  )

  /** Binned folders, drawn above the binned projects in the BIN lens. */
  const binnedFolderTiles = useMemo<Tile[]>(
    () =>
      binnedFolders.map((folder) => ({
        id: folder.id,
        mark: 'folder',
        name: folder.name,
        detail: folder.trashedFrom ? `was ${folder.trashedFrom}` : 'Deleted',
        colour: folder.colour,
        title: folder.trashedFrom ?? folder.path
      })),
    [binnedFolders]
  )

  const volumeTiles = useMemo<Tile[]>(
    () =>
      allVolumes.map((volume) => ({
        id: volume.id,
        mark: volume.kind,
        name: volume.title,
        detail: [
          VOLUME_KIND_LABEL[volume.kind],
          volume.trackCount > 0
            ? `${volume.trackCount} track${volume.trackCount === 1 ? '' : 's'}`
            : null
        ]
          .filter(Boolean)
          .join(' · '),
        colour: volume.colour,
        favourite: volume.favourite,
        title: volume.artist || volume.title
      })),
    [allVolumes]
  )

  // ------------------------------------------------------------------ copy

  const emptyMessage = (): string => {
    if (lens === 'bin') {
      return binnedFolders.length > 0
        ? 'No projects deleted on their own — the folders above hold theirs.'
        : 'Nothing deleted. Projects and folders wait here until you remove them for good.'
    }
    if (total === 0) {
      return scan.phase === 'done'
        ? 'The scan found no folders containing an Ableton set. Create a project on a shelf above, or add another location in INDEXING.'
        : 'Nothing indexed yet. Create a project, or run a scan to read the configured locations.'
    }
    if (lens === 'unfiled') {
      return 'Nothing loose. Every project the scan found is on a shelf.'
    }
    if (browsing) {
      return 'Nothing on this shelf yet. Create a project here, or bring one in from INTAKE.'
    }
    if (lens === 'volumes' && volumeId !== null) {
      return 'No tracks on this volume yet. Right-click a project and assign it here.'
    }
    return 'No projects match the current filters.'
  }

  const registerView = (): ReactNode => {
    /*
     * A skeleton in the shape of the view that is coming, not a sentence.
     *
     * "Reading the register…" told the operator nothing they could not infer
     * and left the panel empty, so the page visibly jumped when the projects
     * landed. Drawing the grid or the ledger up front means the real rows
     * replace these in place — and the shape itself says what is arriving,
     * which is more than the sentence did.
     */
    if (isLoading) {
      return view === 'list' ? (
        <SkeletonRows label="Reading the register" />
      ) : (
        <SkeletonTiles label="Reading the register" />
      )
    }

    if (projects.length === 0) return <p className={styles.empty}>{emptyMessage()}</p>

    const shared = {
      projects,
      selectedId,
      onSelect: selectProject,
      onProjectDragStart,
      onProjectMenu,
      onToggleFavourite: favouriteById
    }

    if (view === 'list') return <ProjectListView {...shared} />

    /*
     * ICONS is the same tile everywhere.
     *
     * It used to be a separate card view built around cover artwork, which read
     * as a different kind of object from the tiles in STACKS and — for the
     * unsorted sets this department mostly holds — drew a grid of empty frames.
     * The tile now shows artwork when a project has any and its mark when it
     * does not, so one component covers both without promising art that is not
     * there.
     */
    if (view === 'grid') {
      return (
        <TileGrid
          tiles={projectTiles}
          onOpen={selectProject}
          selectedId={tileSelection}
          onSelect={setTileSelection}
          marked={marked}
          onMark={toggleMarked}
          onMenu={onTileMenu}
          onToggleFavourite={favouriteById}
          disabled={scanning}
        />
      )
    }

    return (
      <ProjectBoardView
        {...shared}
        stageCounts={registry?.stageCounts ?? ({} as Record<ProjectStage, number>)}
        onStageChange={changeStage}
      />
    )
  }

  const openVolumeRecord = allVolumes.find((volume) => volume.id === volumeId) ?? null

  // ----------------------------------------------------------------- panels

  const mainPanel = (): ReactNode => {
    /*
     * INTAKE is where work comes in, not a second project list.
     *
     * The lens has always meant "everything found on disk that is not on a
     * shelf yet", which is precisely the work that needs bringing in — so
     * rather than inventing a mode the operator has to go and find, the lens
     * that already asks the question now shows the answer side by side with
     * somewhere to put it.
     */
    if (lens === 'unfiled') {
      /*
         `.browser` for the padding, as every other lens that draws into the
         flush panel does. The panel is `flush` so the folder browser can sit
         its breadcrumb against the header rule, which means each lens supplies
         its own inset — and this one was returning its panes bare, so the
         tiles ran to the very edge of the page while the headings above them
         were indented.
      */
      return (
        <div className={styles.browser}>
          <IntakeView
            roots={intakeRoots}
            folders={folders}
            projects={projects}
            // BOARD has no meaning over directories, and the toggle beside
            // this panel does not offer it — but `view` is shared page state
            // and can still be holding it from another lens.
            view={view === 'grid' ? 'grid' : 'list'}
            onFile={fileMany}
            disabled={scanning || locked}
          />
        </div>
      )
    }

    if (lens === 'releases') {
      return (
        <ReleaseBoard
          releases={allReleases}
          projects={projects}
          volumes={allVolumes}
          openId={releaseId}
          onOpen={openRelease}
          busy={
            releaseMutations.create.isPending ||
            releaseMutations.update.isPending ||
            releaseMutations.attach.isPending
          }
          error={notice}
          onRaise={(subjectKind, subjectId) => {
            setNotice(null)
            releaseMutations.create.mutate(
              { subjectKind, subjectId },
              { onSuccess: (created) => openRelease(created.id), onError: report }
            )
          }}
          onSetDate={(id, releaseDate) => {
            setNotice(null)
            releaseMutations.update.mutate({ id, patch: { releaseDate } }, { onError: report })
          }}
          onAttach={(id, kind: DeliverableKind, sourcePath) => {
            setNotice(null)
            releaseMutations.attach.mutate({ id, kind, sourcePath }, { onError: report })
          }}
          onRemove={(id) => {
            setNotice(null)
            releaseMutations.remove.mutate(id, {
              onSuccess: () => openRelease(null),
              onError: report
            })
          }}
          onReveal={(path) => void window.candy.shell.reveal(path)}
        />
      )
    }

    if (lens === 'volumes' && volumeId === null) {
      return (
        <div className={styles.browser}>
          {allVolumes.length === 0 ? (
            <div className={styles.stackEmpty}>
              <p className={styles.stackEmptyTitle}>No albums, EPs or compilations yet.</p>
              <p className={styles.stackEmptyHint}>
                A volume binds several tracks into one work. It is a record rather than a folder —
                nothing moves on disk, and each track stays filed under its own genre.
              </p>
            </div>
          ) : null}

          <TileGrid
            tiles={volumeTiles}
            onOpen={openVolume}
            onMenu={onTileMenu}
            selectedId={tileSelection}
            onSelect={setTileSelection}
            onToggleFavourite={favouriteById}
            disabled={locked}
            adds={[
              {
                label: 'New volume',
                mark: 'add',
                onClick: () => {
                  setDialogError(null)
                  setVolumeDialog({ mode: 'create', kind: 'album' })
                }
              }
            ]}
          />
        </div>
      )
    }

    if (lens === 'volumes' && openVolumeRecord) {
      return (
        <div className={styles.browser}>
          <div className={styles.volumeHead}>
            <button type="button" className={styles.back} onClick={() => openVolume(null)}>
              ← All volumes
            </button>
            <span className={styles.volumeTitle}>{openVolumeRecord.title}</span>
            <span className={styles.volumeMeta}>
              {VOLUME_KIND_LABEL[openVolumeRecord.kind]}
              {openVolumeRecord.artist ? ` · ${openVolumeRecord.artist}` : ''}
            </span>
          </div>
          <div className={styles.register}>{registerView()}</div>
        </div>
      )
    }

    if (lens === 'bin') {
      return (
        <div className={styles.browser}>
          {/*
            States the whole contents up front, folders and projects together.
            The bin is the one place in the department that accumulates without
            being visited, so it should say how much is in it rather than making
            the operator count tiles.
          */}
          <p className={styles.hint}>
            {binnedFolders.length > 0
              ? `${binnedFolders.length} folder${binnedFolders.length === 1 ? '' : 's'} and `
              : ''}
            {registry?.trashedCount ?? 0} project
            {(registry?.trashedCount ?? 0) === 1 ? '' : 's'} deleted. A folder came here with
            everything that was inside it, so restoring one puts the whole shelf back. Nothing is
            removed from the drive until you delete it permanently.
          </p>

          {binnedFolderTiles.length > 0 ? (
            <TileGrid tiles={binnedFolderTiles} onOpen={() => undefined} onMenu={onTileMenu} />
          ) : null}

          <div className={styles.register}>{registerView()}</div>
        </div>
      )
    }

    if (browsing) {
      return (
        /*
         * The whole panel is a drop target for the folder being browsed.
         *
         * Tiles accept a drop, but a folder you have just opened usually has no
         * sub-folders in it — so standing inside `EDM` with nothing on the shelf
         * yet, there was no tile to aim at and the entire body rejected the
         * drag. Dropping onto the open folder is the obvious gesture and now the
         * one that works; the tiles keep their own handlers for filing into a
         * folder you can see but are not standing in.
         *
         * Only inside a folder: at the root of the tree, "file here" would mean
         * unfiling, which is what these projects already are.
         */
        <div
          className={styles.browser}
          data-drop={shelfDrop || undefined}
          onDragOver={(event) => {
            if (scanning || folderId === null) return
            if (!isDragging(event, PROJECT_DRAG_TYPE)) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            setShelfDrop(true)
          }}
          onDragLeave={(event) => {
            if (hasLeftElement(event)) setShelfDrop(false)
          }}
          onDrop={(event) => {
            setShelfDrop(false)
            if (scanning || folderId === null) return

            const projectId = readDrag(event, PROJECT_DRAG_TYPE)
            if (!projectId) return

            // A tile inside this panel has already handled the drop and stopped
            // it; anything reaching here was aimed at the shelf itself.
            event.preventDefault()
            fileProject(projectId, folderId)
          }}
        >
          <FolderTrail
            trail={trail}
            onNavigate={openFolder}
            onFileProject={fileProject}
            shown={projects.length}
          />

          {folders.length === 0 && folderId === null ? (
            <div className={styles.stackEmpty}>
              <p className={styles.stackEmptyTitle}>No categories yet.</p>
              <p className={styles.stackEmptyHint}>
                A category is the top of your filing — PERSONAL, COLLABS, CLIENT WORK. Add one below
                and it is created as a real folder inside{' '}
                {`${setup?.wrapper ?? 'your filing root'}${String.fromCharCode(92)}Projects`}.
                Inside a category you add genres and artists, and projects go in those.
              </p>
            </div>
          ) : null}

          {/*
            One grid, folders and projects together, the way a file browser
            draws a directory. In LIST and BOARD the projects drop out of here
            and are rendered below in their own view instead — the folders stay
            as tiles either way, because they are navigation rather than data.
          */}
          <TileGrid
            /*
             * Projects join the grid only *inside* a folder.
             *
             * At the root, "filed here" resolves to "filed nowhere", so
             * including them turned the top of the archive into a wall of every
             * unsorted project on disk — the opposite of what the shelves are
             * for. The root shows what has been organised; everything else has
             * the UNFILED lens and the panel to the right.
             */
            tiles={
              view === 'grid' && folderId !== null ? [...folderTiles, ...projectTiles] : folderTiles
            }
            onOpen={(id) => {
              // The grid is mixed, so the id decides what opening means:
              // walk into a folder, or open a project's record.
              if (folders.some((folder) => folder.id === id)) openFolder(id)
              else selectProject(id)
            }}
            onMenu={onTileMenu}
            onDropMany={fileMany}
            onDropProject={fileProject}
            onDropFolder={nestFolder}
            selectedId={tileSelection}
            onSelect={setTileSelection}
            marked={marked}
            onMark={toggleMarked}
            onToggleFavourite={favouriteById}
            disabled={scanning || locked}
            adds={[
              {
                label: addFolderLabel,
                mark: 'add',
                onClick: () => {
                  setDialogError(null)
                  setFolderDialog({ mode: 'create', parentId: folderId })
                }
              },
              // Only on a shelf that holds work. The root holds categories and
              // a category holds genres and artists, so neither takes a project.
              ...(canCreateProjectHere && currentFolder
                ? [
                    {
                      label: 'New project',
                      mark: 'add-project' as const,
                      onClick: () => {
                        setDialogError(null)
                        setProjectDialog(currentFolder)
                      }
                    }
                  ]
                : [])
            ]}
          />

          {/*
            The register appears below the tiles only when it has something to
            add that the grid above does not.

            Two reasons it can be absent. In the icons view the projects are
            already *in* that grid, so a table of the same rows underneath would
            be the same shelf drawn twice. And at the root of the tree, "filed
            here" means "filed nowhere" — precisely the list the UNORGANISED
            panel holds permanently beside this one.
          */}
          {folderId !== null && view !== 'grid' ? (
            <div className={styles.register}>{registerView()}</div>
          ) : null}

          {/* The grid draws no empty state of its own; this is the shelf's. */}
          {folderId !== null && view === 'grid' && projects.length === 0 ? (
            <p className={styles.empty}>{emptyMessage()}</p>
          ) : null}
        </div>
      )
    }

    return <div className={styles.register}>{registerView()}</div>
  }

  // ------------------------------------------------------------------ gate

  return (
    <div className={styles.page}>
      <PageHeader
        index={section.order + 1}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
        guideId="archive"
        actions={
          <div className={styles.headerActions}>
            <span className={styles.headerFigure}>
              {total} project{total === 1 ? '' : 's'}
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={() => runScan(false)}
              busy={scanning}
              disabled={locked}
            >
              {scanning ? 'Scanning' : 'Scan'}
            </Button>
          </div>
        }
      />

      {notice ? (
        <div className={styles.notice} role="alert">
          <p className={styles.noticeText}>{notice}</p>
          <button type="button" className={styles.noticeClose} onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      <RegisterControls
        filters={filters}
        onChange={setFilters}
        lens={lens}
        onLensChange={changeLens}
        availableTags={registry?.tags ?? []}
        onManageTags={() => setManagingTags(true)}
        stageCounts={registry?.stageCounts ?? ({} as Record<ProjectStage, number>)}
        categoryCounts={registry?.categoryCounts ?? ({} as Record<ProjectCategory, number>)}
        shown={projects.length}
        total={total}
        // The release board draws tiles and a record, never the register, so a
        // sort order and a stage filter would operate on nothing visible.
        showRegisterControls={lens !== 'releases' && lens !== 'unfiled'}
        searchRef={searchRef}
      />

      <motion.div
        className={styles.grid}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        <Panel
          label={PANEL_LABEL[lens]}
          index="01"
          icon={<ArchiveGlyph name={PANEL_GLYPH[lens]} />}
          className={styles.browserCell}
          focal
          flush
          aside={
            /*
             * How this panel draws, in this panel's own header.
             *
             * Only where a register is actually drawn: RELEASES is a board of
             * its own and VOLUMES at the top level is a tile grid, so the
             * toggle would sit there controlling nothing.
             */
            drawsRegister ? (
              <ViewToggle view={view} onChange={setView} />
            ) : lens === 'unfiled' ? (
              /*
               * INTAKE draws directories rather than a register, so it gets the
               * two modes that mean something over a folder and not BOARD —
               * there are no stages to make columns out of.
               */
              <ViewToggle view={view} onChange={setView} modes={INTAKE_VIEW_MODES} />
            ) : registry?.scan.finishedAt ? (
              <span className={styles.panelAside}>
                Indexed {formatStamp(registry.scan.finishedAt)}
              </span>
            ) : undefined
          }
        >
          {mainPanel()}
        </Panel>

        {/*
          UNORGANISED sits beside the browser rather than below it, and shows
          the same thing at every level of the tree. Navigating into a genre
          used to re-filter the only visible project list to "what is already in
          this genre" — nothing — leaving the operator with a destination and no
          source. Now one panel is the destination and the other is the source.
        */}
        <Panel
          label="Unfiled"
          index="02"
          icon={<ArchiveGlyph name="loose" />}
          className={styles.span3}
          aside={String(registry?.unfiledCount ?? 0)}
        >
          <UnfiledPanel
            disabled={scanning || locked}
            onSelect={selectProject}
            onProjectDragStart={onProjectDragStart}
            onProjectMenu={onProjectMenu}
            marked={marked}
            onMark={toggleMarked}
            onMarkRange={markRange}
          />
        </Panel>

        <Panel
          label="Indexing"
          index="03"
          icon={<ArchiveGlyph name="scan" />}
          className={styles.indexingCell}
        >
          <ScanPanel scan={scan} onScan={runScan} onCancel={cancelScan} busy={false} />
        </Panel>

        {/*
          Last on the page, and only until it is satisfied. Everything above is
          visible from the first launch but inert, so this is read with the
          thing it configures in view rather than in front of it.
        */}
        {locked ? (
          <div className={styles.span6}>
            <SetupGate
              state={setup ?? null}
              busy={stackMutations.setup.isPending}
              error={notice}
              onSubmit={(filingRoot, templatePath, sourceRoots) => {
                setNotice(null)
                stackMutations.setup.mutate(
                  { filingRoot, templatePath, sourceRoots },
                  { onError: report }
                )
              }}
            />
          </div>
        ) : null}
      </motion.div>

      {menu ? (
        <ContextMenu
          target={menu}
          filingTargets={filingTargets}
          volumes={allVolumes}
          onClose={() => setMenu(null)}
          onOpenFolder={(id) => {
            setMenu(null)
            changeLens('stacks')
            openFolder(id)
          }}
          onNewProject={(folder) => {
            setMenu(null)
            setDialogError(null)
            setProjectDialog(folder)
          }}
          onRenameFolder={(folder) => {
            setMenu(null)
            setDialogError(null)
            setFolderDialog({ mode: 'rename', folder })
          }}
          onDeleteFolder={deleteFolder}
          onRestoreFolder={restoreFolder}
          onPurgeFolder={(folder) => {
            setMenu(null)
            setConfirm({ kind: 'purgeFolder', folder })
          }}
          onFileProject={fileProject}
          onAssignVolume={assignVolume}
          onOpenProject={(id) => {
            setMenu(null)
            selectProject(id)
          }}
          onOpenInLive={(id) => {
            setMenu(null)
            setNotice(null)
            window.candy.projects.open(id).catch(report)
          }}
          onForgetProject={(project) => {
            setMenu(null)
            setConfirm({ kind: 'forget', project })
          }}
          onTrashProject={(project) => {
            setMenu(null)
            setConfirm({ kind: 'trash', project })
          }}
          onRestoreProject={restoreProject}
          onPurgeProject={(project) => {
            setMenu(null)
            setConfirm({ kind: 'purge', project })
          }}
          onEditVolume={(volume) => {
            setMenu(null)
            setDialogError(null)
            setVolumeDialog({ mode: 'edit', volume })
          }}
          onDeleteVolume={(volume) => {
            setMenu(null)
            setConfirm({ kind: 'volume', volume })
          }}
          onToggleFavourite={toggleFavourite}
          onReveal={(path) => {
            setMenu(null)
            void window.candy.shell.reveal(path)
          }}
        />
      ) : null}

      {folderDialog ? (
        <FolderDialog
          mode={folderDialog.mode}
          topLevel={
            folderDialog.mode === 'create'
              ? folderDialog.parentId === null
              : folderDialog.folder.parentId === null
          }
          /*
           * What may be made here is read off the parent's kind rather than
           * off depth. The dialog states it when there is one answer and asks
           * when there are two — a category holds genres and artists both.
           */
          kinds={
            folderDialog.mode === 'create'
              ? allowedChildKinds(
                  folderDialog.parentId
                    ? (folders.find((entry) => entry.id === folderDialog.parentId)?.kind ?? null)
                    : null
                )
              : undefined
          }
          where={
            folderDialog.mode === 'create'
              ? (currentFolder?.path ?? setup?.wrapper ?? '')
              : folderDialog.folder.path
          }
          initialName={folderDialog.mode === 'rename' ? folderDialog.folder.name : ''}
          initialColour={folderDialog.mode === 'rename' ? folderDialog.folder.colour : undefined}
          busy={stackMutations.create.isPending || stackMutations.update.isPending}
          error={dialogError}
          onSubmit={submitFolder}
          onCancel={() => {
            setFolderDialog(null)
            setDialogError(null)
          }}
        />
      ) : null}

      {projectDialog ? (
        <ProjectDialog
          where={projectDialog.path}
          volumes={allVolumes}
          busy={mutations.create.isPending}
          error={dialogError}
          onSubmit={submitProject}
          onNewVolume={(kind) => {
            setDialogError(null)
            setVolumeDialog({ mode: 'create', kind })
          }}
          onCancel={() => {
            setProjectDialog(null)
            setDialogError(null)
          }}
        />
      ) : null}

      {volumeDialog ? (
        <VolumeDialog
          mode={volumeDialog.mode}
          initialKind={
            volumeDialog.mode === 'create' ? volumeDialog.kind : volumeDialog.volume.kind
          }
          initialTitle={volumeDialog.mode === 'edit' ? volumeDialog.volume.title : ''}
          initialArtist={volumeDialog.mode === 'edit' ? volumeDialog.volume.artist : ''}
          initialColour={volumeDialog.mode === 'edit' ? volumeDialog.volume.colour : undefined}
          trackCount={volumeDialog.mode === 'edit' ? volumeDialog.volume.trackCount : 0}
          busy={volumeMutations.create.isPending || volumeMutations.update.isPending}
          error={dialogError}
          onSubmit={submitVolume}
          onCancel={() => {
            setVolumeDialog(null)
            setDialogError(null)
          }}
        />
      ) : null}

      {confirm ? (
        <ConfirmDialog
          {...confirmCopy(confirm)}
          busy={
            stackMutations.remove.isPending ||
            stackMutations.purge.isPending ||
            mutations.forget.isPending ||
            mutations.trash.isPending ||
            volumeMutations.remove.isPending
          }
          onConfirm={runConfirmed}
          onCancel={() => setConfirm(null)}
        />
      ) : null}

      {/*
        Reachable from the filter row as well as from a project's record.

        A tag's *shape* — a misspelling, two colours too close to tell apart —
        is noticed while filtering by it rather than while applying it, so the
        library has to be openable from where that happens.
      */}
      {managingTags ? (
        <TagManagerDialog
          library={registry?.tags ?? []}
          busy={tagMutations.update.isPending || tagMutations.remove.isPending}
          error={(tagMutations.update.error ?? tagMutations.remove.error)?.message ?? null}
          onRename={(id, name) => tagMutations.update.mutate({ id, patch: { name } })}
          onRecolour={(id, colour) => tagMutations.update.mutate({ id, patch: { colour } })}
          onDelete={(id) => tagMutations.remove.mutate(id)}
          onClose={() => setManagingTags(false)}
        />
      ) : null}

      <AnimatePresence>
        {selectedId ? (
          <ProjectDossier
            key={selectedId}
            projectId={selectedId}
            onClose={() => selectProject(null)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/** The focal panel's label follows the lens, so the page names what it shows. */
/** The view modes INTAKE offers. BOARD needs stages; a directory has none. */
const INTAKE_VIEW_MODES = ['list', 'grid'] as const

const PANEL_LABEL: Record<ArchiveLens, string> = {
  stacks: 'Stacks',
  unfiled: 'Intake',
  volumes: 'Volumes',
  releases: 'Releases',
  all: 'Register',
  bin: 'Recycle bin'
}

/**
 * And so does its mark.
 *
 * Drawn from the same family as the tiles beneath it — a shelf heading over
 * shelf tiles, a plate over volume tiles — so the panel and its contents are
 * plainly about one thing. See `ArchiveGlyph` for why these are a separate
 * set from the 64×48 marks the tiles themselves use.
 */
const PANEL_GLYPH: Record<ArchiveLens, ArchiveGlyphName> = {
  stacks: 'shelf',
  unfiled: 'loose',
  volumes: 'master',
  releases: 'seal',
  all: 'index',
  bin: 'bin'
}

/**
 * Wording for each confirmation.
 *
 * Gathered in one function rather than spread across four call sites so the
 * four can be read against each other — the whole point is that FORGET and
 * DELETE must not sound alike, and that a volume's "dissolve" must not sound
 * destructive at all.
 */
function confirmCopy(state: ConfirmState): {
  title: string
  message: string
  detail: string
  confirmLabel: string
  danger?: boolean
} {
  switch (state.kind) {
    case 'folder':
      return {
        title: 'Delete folder',
        message: `Move “${state.folder.name}” to the bin?`,
        detail:
          state.projects > 0
            ? `The folder goes to the recycle bin with everything in it — ${state.projects} project${
                state.projects === 1 ? '' : 's'
              }, and any folders inside. Nothing is deleted, and the BIN lens puts the whole shelf back.`
            : 'The folder goes to the recycle bin. Nothing is deleted, and the BIN lens puts it back.',
        confirmLabel: 'Move to the bin',
        danger: true
      }

    case 'forget':
      return {
        title: 'Forget project',
        message: `Stop tracking “${state.project.name}”?`,
        detail:
          'The record is removed from the register. Every file stays exactly where it is, and the next scan will find the project again.',
        confirmLabel: 'Forget it'
      }

    case 'trash':
      return {
        title: 'Delete project',
        message: `Move “${state.project.name}” to the bin?`,
        detail:
          'The whole project folder moves into the archive’s recycle bin — set, samples, backups and all. It stays there until you empty it, and the BIN lens will put it back where it came from.',
        confirmLabel: 'Move to the bin',
        danger: true
      }

    case 'purge':
      return {
        title: 'Delete permanently',
        message: `Remove “${state.project.name}” for good?`,
        detail: `The folder leaves the archive and goes to Windows' own Recycle Bin, which is the last place it can be recovered from. Nothing in this application will bring it back. ${state.project.path}`,
        confirmLabel: 'Delete permanently',
        danger: true
      }

    case 'purgeFolder':
      return {
        title: 'Delete permanently',
        message: `Remove “${state.folder.name}” and everything in it for good?`,
        detail: `The folder leaves the archive and goes to Windows' own Recycle Bin, which is the last place it can be recovered from — with every project that was filed inside it. Nothing in this application will bring it back. ${state.folder.path}`,
        confirmLabel: 'Delete permanently',
        danger: true
      }

    case 'volume':
      return {
        title: 'Dissolve volume',
        message: `Dissolve “${state.volume.title}”?`,
        detail:
          state.volume.trackCount > 0
            ? `Its ${state.volume.trackCount} track${
                state.volume.trackCount === 1 ? '' : 's'
              } become standalone singles. No files move and nothing is deleted — a volume never owned a directory.`
            : 'It holds no tracks. Nothing else changes.',
        confirmLabel: 'Dissolve'
      }
  }
}
