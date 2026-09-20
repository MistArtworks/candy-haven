import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import { BOOT_STAGES } from '@shared/domain/boot.constants'
import type { BootPhase } from '@shared/domain/boot'
import { useSystemStore, selectArchive, selectBoot } from '@renderer/app/store/system.store'
import { useArchiveSetup, useStacksTree } from '@renderer/hooks/useStacks'
import { useProjectMutations } from '@renderer/hooks/useProjects'
import { useThemePreferences } from '@renderer/hooks/useMotionPreference'
import type { PointerLean } from '@renderer/features/home/components/GenesisField'
import { VestibuleField } from './components/VestibuleField'
import { VestibuleBar } from './components/VestibuleBar'
import { ChoiceTiles } from './components/ChoiceTiles'
import { NewProjectForm } from './components/NewProjectForm'
import styles from './VestibulePage.module.scss'

/**
 * Where the last set was filed, so the common case is no navigation at all.
 *
 * `localStorage` rather than settings: it is a UI convenience about one
 * window's last position in a tree, not an operator preference, and it must not
 * appear in an exported settings bundle or count as an unsaved change. A stale
 * id simply resolves to nothing and the browser opens at the root.
 */
const LAST_SHELF_KEY = 'candy-haven.vestibule.shelf'

/** The stage table is fixed, so the label lookup can be built once. */
const STAGE_LABEL = new Map(BOOT_STAGES.map((stage) => [stage.id, stage.label]))

type Mode = 'choose' | 'create'

/**
 * THE VESTIBULE — the room before the department.
 *
 * Two doors: a new project, or the console. It opens ahead of both, while the
 * boot sequence is still running behind it, which is the only reason the first
 * door can be immediate — by the time the operator has read the tiles the
 * archive is usually up.
 *
 * Boot is *not* driven from here. The main process runs it regardless of which
 * window is on screen, so this window only mirrors it, exactly as the boot
 * screen does. What it adds is a rail saying so, because a disarmed door with
 * no explanation is worse than a slow one.
 */
export function VestibulePage(): ReactNode {
  const boot = useSystemStore(selectBoot)
  const archive = useSystemStore(selectArchive)

  /*
   * The accent, the grain and the interface scale, applied here.
   *
   * The console does this in its shell, which this window never mounts —
   * without it the vestibule would draw at the default accent and scale
   * whatever REGULATION says, and being the *first* thing on screen is exactly
   * where that drift would show.
   */
  useThemePreferences()

  const [mode, setMode] = useState<Mode>('choose')
  const [storedShelfId, setStoredShelfId] = useState<string | null>(() =>
    window.localStorage.getItem(LAST_SHELF_KEY)
  )
  const [error, setError] = useState<string | null>(null)

  const archiveOnline = archive.state === 'online' || archive.state === 'degraded'

  const { data: setup } = useArchiveSetup()
  // Held back until the archive answers: the tree comes out of Mongo, and
  // asking before the daemon is up only produces a failed query to retry.
  const { data: tree } = useStacksTree(archiveOnline)
  const mutations = useProjectMutations()

  const canCreate = archiveOnline && (setup?.ready ?? false)

  const leanRef = useRef<PointerLean>({ x: 0, y: 0 })
  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    leanRef.current = {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: ((event.clientY - rect.top) / rect.height) * 2 - 1
    }
  }, [])

  /*
   * A shelf deleted since it was last used falls back to the root.
   *
   * Resolved while rendering rather than corrected from an effect: the
   * remembered id is only a hint, and an effect would draw one frame of a
   * breadcrumb naming a folder the tree no longer contains before fixing
   * itself. Left alone until the tree has actually loaded, so a slow query does
   * not read as a missing folder.
   */
  const shelfId =
    storedShelfId === null || !tree
      ? storedShelfId
      : (tree.folders.find((folder) => folder.id === storedShelfId)?.id ?? null)

  const chooseShelf = useCallback((id: string | null) => {
    setStoredShelfId(id)
    if (id) window.localStorage.setItem(LAST_SHELF_KEY, id)
    else window.localStorage.removeItem(LAST_SHELF_KEY)
  }, [])

  const submit = useCallback(
    (draft: { folderId: string; name: string; colour: string }) => {
      setError(null)

      mutations.create.mutate(
        /*
         * Always a single, and not asked for. See NewProjectForm.
         *
         * Stated here rather than left to `ProjectDraftSchema`'s default,
         * which does exist: `ProjectDraft` is the schema's *output* type, so
         * the default is already applied by the time the renderer sees it and
         * the field is required. Omitting it is a compile error, not a
         * defaulted value.
         */
        { ...draft, category: 'single', artistIds: [] },
        {
          onSuccess: (record) => {
            /*
             * Hand it to Ableton and stand down.
             *
             * The whole point of this window: the console never loads, and what
             * the operator is left looking at is the set they asked for. Errors
             * from the handoff land in the same place as errors from the create
             * — if Ableton could not be launched, that is worth saying rather
             * than closing the window on.
             */
            void window.candy.vestibule.handoff(record.id).catch((cause: Error) => {
              setError(cause.message)
            })
          },
          onError: (cause: Error) => {
            const hint = (cause as { hint?: string | null }).hint
            setError(hint ? `${cause.message} ${hint}` : cause.message)
          }
        }
      )
    },
    [mutations.create]
  )

  return (
    <div className={styles.vestibule} onPointerMove={onPointerMove}>
      <VestibuleField leanRef={leanRef} tone={archiveOnline ? 'nominal' : 'unstable'} />

      <VestibuleBar />

      {/*
        Keyed on the mode so React remounts across the switch and the CSS
        entrance runs again. `motion` would give an exit animation too, but it
        lives in a vendor chunk with GSAP and anime.js — half a megabyte of
        libraries this window does not otherwise touch, loaded before the first
        thing the operator sees. Two fades are not worth that, and the house
        easing curve is a token either way.
      */}
      <main className={styles.stage} key={mode}>
        {mode === 'choose' ? (
          <ChoiceTiles
            canCreate={canCreate}
            blockedReason={describeBlock(boot.phase, archiveOnline, setup?.ready ?? false)}
            onCreate={() => setMode('create')}
            onConsole={(route) => void window.candy.vestibule.console(route)}
          />
        ) : (
          <NewProjectForm
            folders={tree?.folders ?? []}
            shelfId={shelfId}
            onShelfChange={chooseShelf}
            busy={mutations.create.isPending}
            error={error}
            onSubmit={submit}
            onBack={() => {
              setMode('choose')
              setError(null)
            }}
          />
        )}
      </main>

      <StatusRail />

      {/* Ambient grain and vignette, above content and inert to pointers. */}
      <div className="ch-ambience" aria-hidden="true">
        <div className="ch-ambience__grain" />
        <div className="ch-ambience__vignette" />
      </div>
    </div>
  )
}

/**
 * Why the door is shut, in the words the operator can act on.
 *
 * Kept to a line. It replaces the caption inside a small square tile, and the
 * remedy is the tile immediately beside it either way — a sentence telling them
 * to open the console, printed next to a door marked THE CONSOLE, is words for
 * the sake of words.
 */
function describeBlock(phase: BootPhase, archiveOnline: boolean, setupReady: boolean): string {
  if (phase === 'failed') return 'The archive did not start.'
  if (!archiveOnline) return 'Waiting for the archive.'
  if (!setupReady) return 'The archive is not set up yet.'
  return ''
}

/**
 * The bottom rail — what boot is doing, and what the archive settled on.
 *
 * The one honest thing a launcher can say while it makes the operator wait.
 * Values come from the same snapshot the boot screen mirrors, so this is a
 * readout rather than a spinner: the sequence is real work and the rail names
 * the stage doing it.
 */
function StatusRail(): ReactNode {
  const boot = useSystemStore(selectBoot)
  const archive = useSystemStore(selectArchive)

  const stage = boot.activeStageId ? (STAGE_LABEL.get(boot.activeStageId) ?? null) : null

  let label: string
  if (boot.phase === 'failed') label = boot.failure?.message ?? 'ARCHIVE FAULT'
  else if (boot.phase === 'ready') label = 'ARCHIVE ONLINE'
  else if (stage) label = stage
  else label = 'STARTING'

  return (
    <footer className={styles.rail} data-tone={boot.phase === 'failed' ? 'fault' : undefined}>
      <span className={styles.railLabel}>{label}</span>
      <span className={styles.railRule} aria-hidden="true">
        <span
          className={styles.railFill}
          style={{ transform: `scaleX(${boot.phase === 'ready' ? 1 : boot.overall})` }}
        />
      </span>
      {archive.port ? <span className={styles.railPort}>:{archive.port}</span> : null}
    </footer>
  )
}
