import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { ProjectStage } from '@shared/domain/projects'
import { evaluateReadiness, getStage } from '@shared/domain/projects.constants'
import { Portal } from '@renderer/components/primitives/Portal'
import { Button } from '@renderer/components/primitives/Button'
import { ArchiveGlyph } from './icons/ArchiveGlyph'
import { useProject, useProjectMutations } from '@renderer/hooks/useProjects'
import { useTagMutations, useTags } from '@renderer/hooks/useTags'
import { DossierOverview } from './dossier/DossierOverview'
import { DossierRecord } from './dossier/DossierRecord'
import { DossierFiles } from './dossier/DossierFiles'
import { formatKey, formatLength, formatTempo } from '../lib/present'
import styles from './ProjectDossier.module.scss'
import { Skeleton, SkeletonRegion, SkeletonText } from '@renderer/components/primitives/Skeleton'

/**
 * Three tabs — and OVERVIEW is deliberately the thinnest of them.
 *
 * It used to carry four panels: the full set analysis down to scene counts and
 * plugin names, the complete record, every note, and the stage history. All of
 * it true, all of it at once, and the operator opening a project to check its
 * tempo had to find that figure among thirty others. An overview that contains
 * everything is not an overview.
 *
 * So the split is by *question asked*, not by subject:
 *
 * - **OVERVIEW** — what is this and what do I want to do about it. Tempo, key,
 *   length; the two open actions; the operator's own notes and tags.
 * - **RECORD** — the rest of the facts, for when they are actually wanted.
 *   Full analysis, the register's own fields, the stage history.
 * - **FILES** — what is in the folder, and the master picks settled there.
 *
 * The **stage is read in the masthead and set in OVERVIEW** — see
 * `StageStrip` for why it took four attempts to stop treating it as chrome.
 * It is legible from every tab either way, which is why dropping the RECORD
 * panel out of OVERVIEW cost nothing.
 *
 * RELEASE, PROMOTION and PLATFORMS were removed earlier with the release
 * rework: a release is its own object now, kept in its own lens, and a project
 * that has not been raised for release has nothing to say about ISRCs or
 * platform links.
 */
const TABS = ['overview', 'record', 'files'] as const
type DossierTab = (typeof TABS)[number]

const TAB_LABEL: Record<DossierTab, string> = {
  overview: 'OVERVIEW',
  record: 'RECORD',
  files: 'FILES'
}

export interface ProjectDossierProps {
  projectId: string
  onClose: () => void
}

/**
 * The full record for one project.
 *
 * Presented as an overlay rather than a route so the register keeps its scroll
 * position, filters and view mode — the operator moves through a shortlist of
 * projects one after another, and losing the list each time would make that
 * unusable.
 *
 * Tabbed because a complete record is genuinely large, and because it keeps the
 * single-focal-object rule intact: each tab has one panel carrying the accent
 * rather than six slabs competing across one enormous scroll.
 */
export function ProjectDossier({ projectId, onClose }: ProjectDossierProps): ReactNode {
  const { data: project, isLoading, error } = useProject(projectId)
  const mutations = useProjectMutations()

  /*
   * The tag library, fetched by the shell and handed down.
   *
   * One query for the dossier rather than one per tab: OVERVIEW draws the
   * picker and RECORD may well grow a tag column, and two components asking
   * for the same list would take two copies of it into two caches.
   */
  const { data: tagLibrary } = useTags()
  const tagMutations = useTagMutations()
  const tags = useMemo(
    () => ({ library: tagLibrary ?? [], mutations: tagMutations }),
    [tagLibrary, tagMutations]
  )
  const [tab, setTab] = useState<DossierTab>('overview')
  const [dismissed, setDismissed] = useState<string | null>(null)

  /*
   * Opening the project, two ways.
   *
   * `openPath` on the directory lands Explorer inside it; `reveal` would open
   * the parent with the folder highlighted, which is the wrong end of the
   * gesture when the folder is the thing you want.
   *
   * Ableton goes through `projects:open` rather than opening a path directly,
   * because the main process is what knows which of several `.als` files in a
   * project folder is the current set as opposed to a backup.
   *
   * Passed to the tabs rather than drawn here: "open this project" belongs to
   * the dossier, but the header is where the dossier is *dismissed* from, and
   * the two most-used actions should not share a corner with the way out.
   * Both are refused while the folder is missing — launching a set that is not
   * there produces an OS error dialog naming a path, which is a worse way to
   * learn this than the badge already in the title row.
   */
  const open = useMemo(
    () => ({
      folder: () => {
        if (project) void window.candy.shell.openPath(project.path)
      },
      ableton: () => void window.candy.projects.open(projectId),
      missing: project?.missing ?? true,
      setless: (project?.sets.length ?? 0) === 0
    }),
    [project, projectId]
  )

  // Escape closes, as it does for any modal layer in the shell.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  /*
   * A rejected edit is the interesting case here — the stage gates deliberately
   * refuse incomplete releases — so the reason is surfaced rather than
   * swallowed. Derived during render rather than copied into state by an
   * effect: the mutations already hold the error, and duplicating it would mean
   * a second render pass every time one failed.
   */
  const failure = [
    mutations.patch.error,
    mutations.addNote.error,
    // A tag name already taken is refused by the service, and this notice bar
    // is the only place in the dossier that can say so.
    tagMutations.create.error,
    tagMutations.update.error,
    tagMutations.remove.error
  ].find((value): value is Error => value instanceof Error) as
    (Error & { hint?: string | null }) | undefined

  const failureText = failure
    ? failure.hint
      ? `${failure.message} ${failure.hint}`
      : failure.message
    : null

  // Dismissal is remembered by message, so a repeat of the same refusal stays
  // hidden while a different one still surfaces.
  const notice = failureText && failureText !== dismissed ? failureText : null

  const readiness = project ? evaluateReadiness(project) : []

  /*
   * The figures under the title.
   *
   * These used to be a SET panel on OVERVIEW, and before that they shared it
   * with eight more. The panel is gone: three or four numbers do not need a
   * slab, a heading and an index to be read, and giving them one pushed the
   * only thing on the tab the operator actually *writes* into — their notes —
   * into a column beside it.
   *
   * Sited where the folder path, byte size, set count and revision count used
   * to be. Those were true and nobody wanted them at a glance; they now live
   * in RECORD, under ON DISK, which is the tab for exactly that.
   *
   * A fourth figure, WORKED ON, was here briefly and has been removed. It
   * could only ever report elapsed calendar time between the oldest and
   * newest save — nothing on disk records hours at the desk — so a track
   * touched twice a fortnight apart claimed two weeks of work. A figure that
   * needs a caveat to avoid being read as a lie does not belong in a masthead.
   */
  const primary = project
    ? (project.sets.find((set) => set.isPrimary) ?? project.sets[0] ?? null)
    : null
  const analysis = primary?.analysis ?? null

  const setStage = (stage: ProjectStage): void => {
    setDismissed(failureText)
    mutations.patch.mutate({ id: projectId, patch: { stage } })
  }

  return (
    <Portal>
      <motion.div
        className={styles.layer}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        role="dialog"
        aria-modal="true"
        aria-label="Project record"
      >
        {/* Backdrop click closes; the sheet stops propagation. */}
        <button
          type="button"
          className={styles.backdrop}
          aria-label="Close project record"
          onClick={onClose}
        />

        <motion.section
          className={styles.sheet}
          initial={{ opacity: 0, y: 18, scale: 0.995 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.997 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        >
          {isLoading || !project ? (
            <div className={styles.loading}>
              {error ? (
                <p className={styles.noticeText}>{(error as Error).message}</p>
              ) : (
                /*
                 * A record in outline: the title, its figures, then the panels.
                 *
                 * The error case keeps its sentence — a failure needs words,
                 * and a skeleton that never resolves would be a lie. Only the
                 * genuinely-loading case is drawn as the thing it will become.
                 */
                <SkeletonRegion label="Retrieving record" className={styles.loadingSkeleton}>
                  <Skeleton width="52%" height="20px" />
                  <Skeleton width="34%" height="10px" />
                  <SkeletonText lines={2} />
                  <Skeleton height="96px" />
                  <Skeleton height="96px" />
                </SkeletonRegion>
              )}
              <Button size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          ) : (
            <>
              <header className={styles.header}>
                <div className={styles.headerTop}>
                  {/*
                    The two things you do *to* this project lead the title,
                    as a pair: what it is, and whether it is one you care
                    about. Both are state rather than navigation, which is
                    why they are here and not in the corner with CLOSE — the
                    way out should not share a hit area with the record's own
                    controls.
                  */}
                  <div className={styles.titleRow}>
                    <button
                      type="button"
                      className={styles.favourite}
                      data-on={project.favourite || undefined}
                      aria-pressed={project.favourite}
                      aria-label="Favourite"
                      title={project.favourite ? 'Remove from favourites' : 'Mark as a favourite'}
                      onClick={() =>
                        mutations.patch.mutate({
                          id: projectId,
                          patch: { favourite: !project.favourite }
                        })
                      }
                    >
                      <ArchiveGlyph name="favourite" className={styles.favouriteGlyph} />
                    </button>

                    <h2 className={styles.title}>{project.name}</h2>
                    {project.missing ? (
                      <span className={styles.missing}>FOLDER MISSING</span>
                    ) : null}
                  </div>

                  <div className={styles.headerActions}>
                    <Button size="sm" onClick={onClose}>
                      Close
                    </Button>
                  </div>
                </div>

                {/*
                  The readings. Values only — no TEMPO / KEY / LENGTH
                  captions above them.

                  The captions were there to make each reading
                  self-describing, and on a row of four they were also the
                  thing making it congested: eight lines of type where three
                  numbers were wanted. They are not needed. `140 BPM` is a
                  tempo, `B Minor` is a key and `1:36` is a duration to
                  anyone who would be reading this window at all, and each
                  still carries its caption as a title for anyone who is
                  not — including a screen reader.

                  Each figure is dropped rather than shown as a dash when it
                  is absent. A labelled column can carry an em dash and still
                  mean something; an unlabelled one is just a stray mark.
                */}
                <div className={styles.figures}>
                  {/*
                    The stage, read rather than set.

                    It leads the row because it is the first thing worth
                    knowing about a project. Setting it happens in OVERVIEW,
                    under a heading — a stage is the operator's own statement
                    about the work, the same kind of thing as a tag or a note,
                    and it belongs with those rather than loose in the chrome.
                    Four attempts at siting a dropdown up here failed for
                    exactly that reason; see `StageStrip`.
                  */}
                  <span className={styles.figure} title={getStage(project.stage).purpose}>
                    <span className={styles.figureStage}>{getStage(project.stage).label}</span>
                  </span>

                  {analysis?.tempo != null ? (
                    <span className={styles.figure} title="Tempo">
                      <span className={styles.figureValue}>{formatTempo(analysis.tempo)}</span>
                      <span className={styles.figureUnit}>BPM</span>
                    </span>
                  ) : null}

                  {analysis?.key ? (
                    <span className={styles.figure} title="Song key">
                      <span className={styles.figureValue}>{formatKey(analysis.key)}</span>
                    </span>
                  ) : null}

                  {/*
                    The one figure that needed a cue.

                    Tempo can carry BPM and a key names itself, but `1:36` is
                    only obviously a duration once you have decided it is one
                    — it could as easily be a bar count or a revision number.
                    There is no two-letter unit for a duration that is not
                    worse than the dial, so the dial it is.
                  */}
                  {analysis?.arrangementSeconds ? (
                    <span
                      className={styles.figure}
                      title="Length, estimated from the furthest clip"
                    >
                      <ArchiveGlyph name="duration" className={styles.figureGlyph} />
                      <span className={styles.figureValue}>
                        {formatLength(analysis.arrangementSeconds)}
                      </span>
                    </span>
                  ) : null}
                </div>
              </header>

              {notice ? (
                <div className={styles.notice} role="alert">
                  <p className={styles.noticeText}>{notice}</p>
                  <button
                    type="button"
                    className={styles.noticeClose}
                    onClick={() => setDismissed(notice)}
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}

              <nav className={styles.tabs} aria-label="Record sections">
                {TABS.map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    className={styles.tab}
                    data-selected={tab === entry || undefined}
                    aria-current={tab === entry}
                    onClick={() => setTab(entry)}
                  >
                    {TAB_LABEL[entry]}
                    {/* Readiness rides on FILES, because every outstanding item
                      is settled there — the master pick above all. */}
                    {entry === 'files' ? (
                      <span
                        className={styles.tabBadge}
                        data-complete={readiness.every((item) => item.met) || undefined}
                      >
                        {readiness.filter((item) => item.met).length}/{readiness.length}
                      </span>
                    ) : null}
                  </button>
                ))}

                {/*
                  The two actions the whole record leads to, at the trailing
                  end of the tab strip.

                  They have moved twice, and both moves were for the same
                  reason. They began beside CLOSE, which put the most-used
                  controls in the corner that also holds the way out. They
                  then went to the foot of OVERVIEW's set panel, which read
                  well but made them reachable from one tab in three — and
                  that panel has since been removed outright.

                  Here they cost no vertical space, sit on every tab, and are
                  a full row away from CLOSE. OPEN IN ABLETON keeps the accent:
                  two identical ghost buttons read as chrome and get skipped.

                  Both are refused while the folder is missing. Launching a set
                  that is not there produces an OS error dialog naming a path,
                  which is a worse way to learn this than the badge already in
                  the title row.

                  The marks are `ArchiveGlyph`, not the `ArchiveIcon` tile
                  family they started as. That artwork is drawn for a 72px
                  tile, and at button size the project mark's six arrangement
                  bars and clipped corner collapsed into a grey smudge that
                  read as a floppy disk. The small family exists for exactly
                  this size, and `Button` sizes it.
                */}
                <div className={styles.tabActions}>
                  <Button
                    size="sm"
                    icon={<ArchiveGlyph name="shelf" />}
                    disabled={open.missing}
                    title={open.missing ? 'The folder is not on disk' : 'Open the project folder'}
                    onClick={open.folder}
                  >
                    Open folder
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<ArchiveGlyph name="set" />}
                    disabled={open.missing || open.setless}
                    title={
                      open.setless
                        ? 'No Ableton set in this project'
                        : 'Open the set in Ableton Live'
                    }
                    onClick={open.ableton}
                  >
                    Open in Ableton
                  </Button>
                </div>
              </nav>

              <div className={styles.body}>
                {tab === 'overview' ? (
                  <DossierOverview
                    project={project}
                    mutations={mutations}
                    tags={tags}
                    open={open}
                    setStage={setStage}
                  />
                ) : null}
                {tab === 'record' ? (
                  <DossierRecord
                    project={project}
                    mutations={mutations}
                    tags={tags}
                    open={open}
                    setStage={setStage}
                  />
                ) : null}
                {tab === 'files' ? (
                  <DossierFiles
                    project={project}
                    mutations={mutations}
                    tags={tags}
                    open={open}
                    setStage={setStage}
                  />
                ) : null}
              </div>
            </>
          )}
        </motion.section>
      </motion.div>
    </Portal>
  )
}
