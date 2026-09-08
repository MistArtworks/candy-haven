import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { ProjectQuery, ProjectStage, ProjectViewMode } from '@shared/domain/projects'
import { getSection } from '@shared/domain/navigation'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { formatBytes } from '@renderer/lib/format'
import { gridVariants } from '@renderer/motion/transitions'
import {
  useProjectMutations,
  useProjectRegistry,
  useScanState,
  useUnlinkedMedia
} from '@renderer/hooks/useProjects'
import { useSettings } from '@renderer/hooks/useSettings'
import { RegisterControls, type RegisterFilters } from './components/RegisterControls'
import { ProjectListView } from './components/ProjectListView'
import { ProjectGridView } from './components/ProjectGridView'
import { ProjectBoardView } from './components/ProjectBoardView'
import { ProjectDossier } from './components/ProjectDossier'
import { ScanPanel } from './components/ScanPanel'
import { formatStamp } from './lib/present'
import styles from './ArchivePage.module.scss'

const INITIAL_FILTERS: RegisterFilters = {
  search: '',
  stages: [],
  tags: [],
  favouritesOnly: false,
  includeMissing: false,
  sort: 'recent'
}

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
 * Everything the operator has made, indexed from disk, tracked through the
 * production pipeline, and carried through to a complete distribution package
 * and promotional plan. Three views over one set of records: the ledger, the
 * plate view, and the pipeline board where the stage is edited by moving the
 * project itself.
 */
export function ArchivePage(): ReactNode {
  const section = getSection('archive')
  const settings = useSettings()

  const [filters, setFilters] = useState<RegisterFilters>(INITIAL_FILTERS)
  const [view, setView] = useState<ProjectViewMode>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const search = useDebounced(filters.search, 180)

  const query = useMemo<ProjectQuery>(
    () => ({
      search: search || undefined,
      stages: filters.stages.length > 0 ? filters.stages : undefined,
      tags: filters.tags.length > 0 ? filters.tags : undefined,
      favouritesOnly: filters.favouritesOnly || undefined,
      includeMissing: filters.includeMissing || undefined,
      sort: filters.sort
    }),
    [
      search,
      filters.stages,
      filters.tags,
      filters.favouritesOnly,
      filters.includeMissing,
      filters.sort
    ]
  )

  const { data: registry, isLoading } = useProjectRegistry(query)
  const scan = useScanState()
  const mutations = useProjectMutations()

  // Null until hydration completes — distinct from "configured with none".
  const settingsLoaded = settings !== null
  const roots = settings?.workspace.abletonProjectRoots ?? []
  const scanning =
    scan.phase === 'walking' || scan.phase === 'analysing' || scan.phase === 'persisting'

  // Unlinked media is only fetched while its panel can actually be read.
  const { data: unlinked } = useUnlinkedMedia((registry?.unlinkedCount ?? 0) > 0)

  const projects = registry?.projects ?? []
  const total = useMemo(
    () => Object.values(registry?.stageCounts ?? {}).reduce((sum, count) => sum + count, 0),
    [registry?.stageCounts]
  )

  const runScan = useCallback((force = false) => {
    setNotice(null)
    window.candy.projects.scan(force).catch((error: Error & { hint?: string | null }) => {
      setNotice(error.hint ? `${error.message} ${error.hint}` : error.message)
    })
  }, [])

  const cancelScan = useCallback(() => {
    void window.candy.projects.cancelScan()
  }, [])

  const changeStage = useCallback(
    (id: string, stage: ProjectStage) => {
      setNotice(null)
      mutations.patch.mutate(
        { id, patch: { stage } },
        {
          onError: (error: Error & { hint?: string | null }) => {
            setNotice(error.hint ? `${error.message} ${error.hint}` : error.message)
          }
        }
      )
    },
    [mutations.patch]
  )

  const emptyMessage = (): string => {
    if (!settingsLoaded) return 'Reading settings…'
    if (roots.length === 0) {
      return 'No directories are configured. Add the folder that holds your Ableton projects in the INDEXING panel, then run a scan.'
    }
    if (total === 0) {
      return scan.phase === 'done'
        ? 'The scan found no folders containing an Ableton set under the configured roots.'
        : 'Nothing indexed yet. Run a scan to read the configured roots.'
    }
    return 'No projects match the current filters.'
  }

  return (
    <div className={styles.page}>
      <PageHeader
        index={section.order + 1}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
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
              disabled={!settingsLoaded || roots.length === 0}
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
        view={view}
        onViewChange={setView}
        availableTags={registry?.tags ?? []}
        stageCounts={registry?.stageCounts ?? ({} as Record<ProjectStage, number>)}
        shown={projects.length}
        total={total}
      />

      <motion.div
        className={styles.grid}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        <Panel
          label="Register"
          index="01"
          className={styles.span6}
          focal
          flush
          aside={
            registry?.scan.finishedAt ? (
              <span className={styles.panelAside}>
                Indexed {formatStamp(registry.scan.finishedAt)}
              </span>
            ) : undefined
          }
        >
          <div className={styles.register}>
            {isLoading ? (
              <p className={styles.empty}>Reading the register…</p>
            ) : projects.length === 0 ? (
              <p className={styles.empty}>{emptyMessage()}</p>
            ) : view === 'list' ? (
              <ProjectListView
                projects={projects}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ) : view === 'grid' ? (
              <ProjectGridView
                projects={projects}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ) : (
              <ProjectBoardView
                projects={projects}
                selectedId={selectedId}
                onSelect={setSelectedId}
                stageCounts={registry?.stageCounts ?? ({} as Record<ProjectStage, number>)}
                onStageChange={changeStage}
              />
            )}
          </div>
        </Panel>

        <Panel label="Indexing" index="02" className={styles.span3}>
          <ScanPanel scan={scan} onScan={runScan} onCancel={cancelScan} busy={false} />
        </Panel>

        <Panel
          label="Unlinked media"
          index="03"
          className={styles.span3}
          aside={String(registry?.unlinkedCount ?? 0)}
        >
          {(registry?.unlinkedCount ?? 0) === 0 ? (
            <p className={styles.empty}>
              Every audio file found under the configured roots belongs to a project folder.
            </p>
          ) : (
            <div className={styles.stack}>
              <p className={styles.hint}>
                Audio found under a scanned root that sits outside any project folder — loose
                bounces, references, exported stems. Listed so nothing goes uncatalogued.
              </p>

              <div className={styles.unlinkedList}>
                {(unlinked ?? []).map((item) => (
                  <div key={item.path} className={styles.unlinked}>
                    <button
                      type="button"
                      className={styles.unlinkedName}
                      title={item.path}
                      onClick={() => void window.candy.shell.reveal(item.path)}
                    >
                      {item.fileName}
                    </button>
                    <span className={styles.unlinkedMeta}>{formatBytes(item.sizeBytes)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </motion.div>

      <AnimatePresence>
        {selectedId ? (
          <ProjectDossier
            key={selectedId}
            projectId={selectedId}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}
