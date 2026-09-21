import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { getSection } from '@shared/domain/navigation'
import type {
  DiscographyLens,
  DiscographySummary,
  ReleaseKind,
  ReleaseDraft,
  ReleasePatch,
  TrackPatch
} from '@shared/domain/discography'
import {
  DISCOGRAPHY_LENSES,
  DISCOGRAPHY_LENS_LABEL,
  DISCOGRAPHY_LENS_PURPOSE,
  RELEASE_KINDS,
  RELEASE_KIND_LABEL,
  RELEASE_STATUS_LABEL,
  isForthcoming,
  isLinkableStage,
  isPublic
} from '@shared/domain/discography.constants'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Plate } from '@renderer/components/primitives/Plate'
import { formatIsoDate } from '@renderer/lib/format'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { Skeleton } from '@renderer/components/primitives/Skeleton'
import { gridVariants } from '@renderer/motion/transitions'
import { useDiscography, useDiscographyMutations, useRelease } from '@renderer/hooks/useDiscography'
import { useProjectRegistry } from '@renderer/hooks/useProjects'
import { useSystemStore, selectArchive } from '@renderer/app/store/system.store'
import { ReleaseDialog } from './components/ReleaseDialog'
import { SleeveMark } from './components/SleeveMark'
import { ReleaseSheet } from './components/ReleaseSheet'
import { TrackDialog } from './components/TrackDialog'
import styles from './DiscographyPage.module.scss'

/**
 * DISCOGRAPHY — the public record of what shipped.
 *
 * Replaces VOLUMES and the stood-down RELEASES, which between them described
 * one thing twice and neither of which carried what actually ships a track:
 * a label, a catalogue number, a UPC, a date, the platforms it went out on.
 *
 * The department that answers "what have I put out", where the ARCHIVE
 * answers "what have I made". The two are linked one way — a release names
 * the projects behind its tracks, and a track with no project is an ordinary
 * entry rather than a broken one, because most of a back catalogue predates
 * any application. See docs/DISCOGRAPHY.md §3.
 */
export function DiscographyPage(): ReactNode {
  const section = getSection('discography')
  const archive = useSystemStore(selectArchive)
  const ready = archive.state === 'online'

  const { data, isLoading } = useDiscography(ready)
  /*
   * The register, for the track picker and the roster.
   *
   * Asked for unconditionally rather than gated on `ready`: the hook has no
   * enabled flag, and a query against a disconnected archive fails once and
   * is cached as an error rather than retrying — which is the same thing the
   * gate would achieve, without a second shape for this hook to grow.
   */
  const registry = useProjectRegistry({})
  const mutations = useDiscographyMutations()

  const [lens, setLens] = useState<DiscographyLens>('catalogue')
  const [kinds, setKinds] = useState<ReleaseKind[]>([])
  const [search, setSearch] = useState('')
  const [labelFilter, setLabelFilter] = useState('')
  /*
   * The open release lives in the URL, as the ARCHIVE's open dossier does.
   *
   * Local state would have been enough for opening a card. It is not enough to
   * be *arrived at*: naming a final master raises a single for the project,
   * and the dossier offers to go and see it — which needs a link that says
   * which one. `?release=<id>` is the same shape as ARCHIVE's `?project=<id>`,
   * deliberately, so the two record surfaces are addressed the same way.
   *
   * Replaced rather than pushed, for the reason recorded on ARCHIVE's own
   * helper: opening and closing a sheet should not build a history stack the
   * operator has to walk back out of.
   */
  const [searchParams, setSearchParams] = useSearchParams()
  const openId = searchParams.get('release')

  const setOpenId = useCallback(
    (id: string | null) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (id) next.set('release', id)
          else next.delete('release')
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )
  const [raising, setRaising] = useState(false)
  const [addingTrack, setAddingTrack] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const releases = useMemo(() => data?.releases ?? [], [data])
  const roster = useMemo(() => registry.data?.artists ?? [], [registry.data])
  const projects = useMemo(() => registry.data?.projects ?? [], [registry.data])

  const open = useRelease(openId)

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return releases.filter((release) => {
      if (lens === 'catalogue' && !isPublic(release.status)) return false
      if (lens === 'forthcoming' && !isForthcoming(release.status)) return false
      if (kinds.length > 0 && !kinds.includes(release.kind)) return false
      if (labelFilter && release.label !== labelFilter) return false
      if (!needle) return true

      // The label and the credited names are searched alongside the title:
      // "everything on Monstercat" and "everything with Nasko" are the two
      // questions a discography gets asked that a title search cannot answer.
      return [release.title, release.subtitle, release.label, ...release.artistNames]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [releases, lens, kinds, search, labelFilter])

  const filtered = kinds.length > 0 || labelFilter !== '' || search.trim().length > 0

  const clearFilters = (): void => {
    setSearch('')
    setKinds([])
    setLabelFilter('')
  }

  const report = (cause: unknown): void => {
    const failure = cause as Error & { hint?: string | null }
    setNotice(failure.hint ? `${failure.message} ${failure.hint}` : failure.message)
  }

  const raise = (draft: ReleaseDraft): void => {
    setNotice(null)

    mutations.create.mutate(draft, {
      onSuccess: (created) => {
        setRaising(false)
        // Straight into the sheet: the dialog takes what exists when an entry
        // is worth making, and the tracks and artwork follow. The same
        // hand-off ARCHIVE and ARTISTS both make.
        setOpenId(created.id)
      },
      onError: report
    })
  }

  const patch = (value: ReleasePatch): void => {
    if (!openId) return
    setNotice(null)
    mutations.update.mutate({ id: openId, patch: value }, { onError: report })
  }

  /*
   * Projects a track may be linked to.
   *
   * **Finished, filed work only.** Two filters, and each earns its place:
   *
   * - `isLinkableStage` — the ARCHIVE's pipeline is the gate into the
   *   catalogue. Reaching TRACK READY is the operator's statement that the
   *   work is done, and a track on a release is done work. `RELEASED` is in
   *   the set too, because a linked project is moved there the moment its
   *   release goes out; leaving it off would mean shipping something
   *   disqualified it from the catalogue it had just entered.
   * - `folderId !== null` — the register also holds everything the scanner
   *   found loose in the intake roots, scratch sets called `Untitled`, `ting`,
   *   `Uh`. Offering those made the picker a wall of noise.
   *
   * The service refuses anything else regardless, so this is the courtesy and
   * `requireLinkable` is the guard.
   *
   * Computed here rather than in the dialog so the dialog stays a form over
   * values it is given, and because the sheet's track list needs the same
   * set — two derivations of "what is still available" would disagree.
   */
  const linkableProjects = useMemo(() => {
    const taken = new Set((open.data?.tracks ?? []).map((track) => track.projectId).filter(Boolean))
    return projects.filter(
      (project) =>
        project.folderId !== null && isLinkableStage(project.stage) && !taken.has(project.id)
    )
  }, [projects, open.data])

  const counts = useMemo(
    () => ({
      released: releases.filter((r) => isPublic(r.status)).length,
      forthcoming: releases.filter((r) => isForthcoming(r.status)).length
    }),
    [releases]
  )

  return (
    <div className={styles.page}>
      <PageHeader
        index={section.order + 1}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
        guideId="discography"
        actions={
          <div className={styles.headerActions}>
            <StatusDot
              tone={counts.released > 0 ? 'online' : 'offline'}
              label={`${counts.released} out`}
            />
            {counts.forthcoming > 0 ? (
              <StatusDot tone="pending" label={`${counts.forthcoming} coming`} />
            ) : null}
          </div>
        }
      />

      {notice ? (
        <div className={styles.notice} role="alert">
          <span>{notice}</span>
          <button type="button" className={styles.dismiss} onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {!ready ? (
        <Panel label="Catalogue" index="01">
          <p className={styles.hint}>
            The archive is not connected, so the catalogue cannot be read. NEXUS reports why.
          </p>
        </Panel>
      ) : (
        <>
          {/*
            Three rows, split by what each is for: where you are, what you
            are looking at, and what you can do. They were one row with a
            text field that *created* a release sitting beside three that
            filtered them, and nothing told the eye which was which.
          */}
          <div className={styles.bar}>
            <div className={styles.barRow}>
              <div className={styles.lenses}>
                {DISCOGRAPHY_LENSES.map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    className={styles.lens}
                    data-on={lens === entry || undefined}
                    aria-pressed={lens === entry}
                    title={DISCOGRAPHY_LENS_PURPOSE[entry]}
                    onClick={() => setLens(entry)}
                  >
                    {DISCOGRAPHY_LENS_LABEL[entry]}
                  </button>
                ))}
              </div>

              <span className={styles.spacer} />

              <Button size="sm" variant="primary" onClick={() => setRaising(true)}>
                Raise a release
              </Button>
            </div>

            <div className={styles.barRow}>
              <div className={styles.searchWrap}>
                <input
                  className={styles.search}
                  value={search}
                  aria-label="Search the catalogue"
                  placeholder="Search by title, label or artist"
                  onChange={(event) => setSearch(event.target.value)}
                />
                {search ? (
                  <button
                    type="button"
                    className={styles.clearSearch}
                    aria-label="Clear the search"
                    onClick={() => setSearch('')}
                  >
                    ✕
                  </button>
                ) : null}
              </div>

              <span className={styles.filterDivider} aria-hidden="true" />

              {RELEASE_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={styles.filterChip}
                  data-on={kinds.includes(kind) || undefined}
                  aria-pressed={kinds.includes(kind)}
                  onClick={() =>
                    setKinds((current) =>
                      current.includes(kind)
                        ? current.filter((entry) => entry !== kind)
                        : [...current, kind]
                    )
                  }
                >
                  {RELEASE_KIND_LABEL[kind]}
                </button>
              ))}

              {/*
                Labels, only once there are any. A select rather than chips:
                the list grows with the catalogue and has no ceiling, which
                is exactly where a row of stamps stops working.
              */}
              {(data?.labels.length ?? 0) > 0 ? (
                <select
                  className={styles.labelFilter}
                  value={labelFilter}
                  aria-label="Filter by label"
                  onChange={(event) => setLabelFilter(event.target.value)}
                >
                  <option value="">Any label</option>
                  {data?.labels.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>
              ) : null}

              <span className={styles.spacer} />

              {filtered ? (
                <>
                  <span className={styles.count}>
                    {shown.length} of {releases.length}
                  </span>
                  <Button size="sm" variant="ghost" onClick={clearFilters}>
                    Clear
                  </Button>
                </>
              ) : (
                <span className={styles.count}>
                  {shown.length} {shown.length === 1 ? 'entry' : 'entries'}
                </span>
              )}
            </div>
          </div>

          <motion.div
            className={styles.grid}
            variants={gridVariants}
            initial="initial"
            animate="animate"
          >
            {isLoading ? (
              <>
                <Skeleton height="420px" className={styles.span2} />
                <Skeleton height="420px" className={styles.span2} />
                <Skeleton height="420px" className={styles.span2} />
              </>
            ) : shown.length === 0 ? (
              <Panel label="Catalogue" index="01" className={styles.span6}>
                <p className={styles.hint}>
                  {releases.length === 0
                    ? 'Nothing in the catalogue yet. Raise a release for anything you have put out — it does not need a project in the ARCHIVE behind it, which is how a back catalogue gets recorded.'
                    : 'Nothing matches that lens and those filters.'}
                </p>
              </Panel>
            ) : (
              shown.map((release, index) => (
                <ReleaseCard
                  key={release.id}
                  release={release}
                  index={index}
                  onOpen={() => setOpenId(release.id)}
                />
              ))
            )}
          </motion.div>
        </>
      )}

      {raising ? (
        <ReleaseDialog
          roster={roster}
          busy={mutations.create.isPending}
          error={notice}
          onSubmit={raise}
          onCancel={() => {
            setRaising(false)
            setNotice(null)
          }}
        />
      ) : null}

      {/*
        Mounted beside the sheet rather than inside it, so the sheet stays a
        record and the dialog stays a form. Both are portalled, and the
        dialog's scrim sits above the sheet's because `z('modal')` is above
        `z('overlay')` — which is the layering those two tokens exist for.
      */}
      {addingTrack && openId && open.data ? (
        <TrackDialog
          releaseTitle={open.data.title}
          available={linkableProjects}
          roster={roster}
          busy={mutations.addTrack.isPending}
          error={notice}
          onSubmit={(draft) => {
            setNotice(null)
            mutations.addTrack.mutate(
              { id: openId, draft },
              { onSuccess: () => setAddingTrack(false), onError: report }
            )
          }}
          onCancel={() => {
            setAddingTrack(false)
            setNotice(null)
          }}
        />
      ) : null}

      <AnimatePresence>
        {openId && open.data ? (
          <ReleaseSheet
            key={openId}
            release={open.data}
            roster={roster}
            projects={projects}
            linkable={linkableProjects}
            labels={data?.labels ?? []}
            busy={
              mutations.update.isPending ||
              mutations.setAsset.isPending ||
              mutations.addTrack.isPending ||
              mutations.updateTrack.isPending ||
              mutations.removeTrack.isPending ||
              mutations.reorderTracks.isPending ||
              mutations.setTrackMaster.isPending ||
              mutations.adopt.isPending
            }
            error={notice}
            onPatch={patch}
            onPublish={() => {
              setNotice(null)
              mutations.publish.mutate(openId, { onError: report })
            }}
            published={mutations.publish.data ?? null}
            publishing={mutations.publish.isPending}
            onAdopt={() => {
              setNotice(null)
              mutations.adopt.mutate(openId, { onError: report })
            }}
            onSetAsset={(asset, sourcePath) => {
              setNotice(null)
              mutations.setAsset.mutate({ id: openId, asset, sourcePath }, { onError: report })
            }}
            releases={data?.releases ?? []}
            onAddTrack={() => {
              setNotice(null)
              setAddingTrack(true)
            }}
            /*
              Adding an existing record as a row: the same channel a typed
              track goes through, with the release named instead of a title.
              The service fills the row from it — see `addTrack`.
            */
            onCollectTrack={(releaseId) => {
              setNotice(null)
              mutations.addTrack.mutate({ id: openId, draft: { releaseId } }, { onError: report })
            }}
            onPatchTrack={(trackId, trackPatch: TrackPatch) => {
              setNotice(null)
              mutations.updateTrack.mutate(
                { id: openId, trackId, patch: trackPatch },
                { onError: report }
              )
            }}
            onRemoveTrack={(trackId) => {
              setNotice(null)
              mutations.removeTrack.mutate({ id: openId, trackId }, { onError: report })
            }}
            onReorderTracks={(trackIds) => {
              setNotice(null)
              mutations.reorderTracks.mutate({ id: openId, trackIds }, { onError: report })
            }}
            onSetTrackMaster={(trackId, path) => {
              setNotice(null)
              mutations.setTrackMaster.mutate({ id: openId, trackId, path }, { onError: report })
            }}
            onRemove={() => {
              setNotice(null)
              mutations.remove.mutate(openId, {
                onSuccess: () => setOpenId(null),
                onError: report
              })
            }}
            onClose={() => setOpenId(null)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}

interface ReleaseCardProps {
  release: DiscographySummary
  index: number
  onOpen: () => void
}

/**
 * One entry in the catalogue.
 *
 * Cover-led, because a discography is recognised by its artwork long before
 * its titles. That is the opposite call from the ARCHIVE's register, where a
 * cover-card view was deleted for drawing a grid of empty frames — most
 * projects have no art, and most of them never will. Here artwork is the
 * point: a release without one is incomplete rather than ordinary, which is
 * why the empty state is a struck sleeve rather than a blank square.
 *
 * The panel's header carries the **kind** rather than the title, so the title
 * can be a title in the caption instead of institutional small-caps in a
 * header rule. The register still reads as a register — numbered, ruled,
 * status on the right — and the object it describes gets to look like a
 * record sleeve.
 */
function ReleaseCard({ release, index, onOpen }: ReleaseCardProps): ReactNode {
  const gap = release.trackCount - release.linkedCount

  /*
   * Kind, date and length on one line, in that order.
   *
   * Dropped rather than dashed when absent — an undated idea says `SINGLE`
   * and stops, because a labelled column can carry an em dash and still mean
   * something whereas an unlabelled one is a stray mark. The same rule the
   * ARCHIVE's dossier masthead settled on.
   */
  const meta = [
    RELEASE_KIND_LABEL[release.kind],
    release.releaseDate ? formatIsoDate(release.releaseDate) : null,
    release.trackCount > 0
      ? `${release.trackCount} track${release.trackCount === 1 ? '' : 's'}`
      : null
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Panel
      label={RELEASE_KIND_LABEL[release.kind]}
      index={String(index + 1).padStart(2, '0')}
      className={styles.span2}
      // Flush so the cover can run to the panel's own edges. A sleeve inset
      // inside a slab reads as a picture *of* a record; filling the frame
      // reads as the record.
      flush
      aside={
        /*
          Two tones, because there are two statuses. This was a three-arm
          ternary ending in `offline`, which covered `shelved` — that arm is
          now unreachable, and leaving it would imply a third state exists.
        */
        <StatusDot
          tone={isPublic(release.status) ? 'online' : 'pending'}
          label={RELEASE_STATUS_LABEL[release.status]}
        />
      }
    >
      <button type="button" className={styles.card} onClick={onOpen}>
        <Plate
          path={release.artwork.copiedPath}
          fallback={<SleeveMark label={RELEASE_KIND_LABEL[release.kind]} />}
          fill
          alt=""
          className={styles.cover}
        />

        <span className={styles.caption}>
          <span className={styles.cardTitle}>{release.title}</span>

          {release.subtitle ? <span className={styles.subtitle}>{release.subtitle}</span> : null}

          {/*
            Who it is by. Drawn even when there is nobody credited, because a
            blank line here would let the meta row jump up and down the grid
            and turn a wall of covers into a ragged one.
          */}
          <span className={styles.by} data-none={release.artistNames.length === 0 || undefined}>
            {release.artistNames.length > 0 ? release.artistNames.join(', ') : 'Uncredited'}
          </span>

          <span className={styles.meta}>{meta}</span>

          {release.label ? <span className={styles.label}>{release.label}</span> : null}

          {gap > 0 ? <span className={styles.unlinked}>{gap} without a project</span> : null}
        </span>
      </button>
    </Panel>
  )
}
