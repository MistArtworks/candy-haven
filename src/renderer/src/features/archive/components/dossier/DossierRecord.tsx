import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { PROJECT_CATEGORY_LABEL, getStage } from '@shared/domain/projects.constants'
import { RELEASE_KIND_LABEL, RELEASE_STATUS_LABEL } from '@shared/domain/discography.constants'
import { Button } from '@renderer/components/primitives/Button'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { Panel } from '@renderer/components/primitives/Panel'
import { formatBytes, formatIsoDate } from '@renderer/lib/format'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import { formatStamp } from '../../lib/present'
import type { DossierTabProps } from './types'
import { DossierGrid } from './DossierGrid'
import styles from './dossier.module.scss'
import * as shell from '@renderer/lib/shell'

/** Stage-history rows drawn before the rest are summarised. See `recentHistory`. */
const HISTORY_SHOWN = 10

/**
 * Everything true about the project that is not the first thing wanted.
 *
 * This tab exists because OVERVIEW was drowning. The set analysis alone is
 * eight figures, a plugin list and two possible warnings; the register adds
 * seven more fields and the history adds a row per stage change. Every one of
 * them is worth keeping — none of them is worth reading past to find the
 * tempo, which is what OVERVIEW asked of the operator before the split.
 *
 * So the rule is: OVERVIEW answers *what is this and what do I do with it*,
 * and this tab answers *tell me everything*. Nothing was deleted in the move.
 *
 * Set analysis keeps the focal accent here as it did there — it is still the
 * substance of the page, and the panels around it are context.
 *
 * ON DISK was added when the dossier masthead was cleared. The folder path,
 * byte size, set count, revision count and index time used to sit under the
 * title, where they were true, permanent and of no interest at a glance — the
 * client's words were that they did not care about them, which is not the
 * same as not wanting them recorded. This is the tab for exactly that
 * distinction.
 */
export function DossierRecord({ project, artists }: DossierTabProps): ReactNode {
  /*
   * Crossing to the catalogue, which is a navigation rather than an overlay.
   *
   * The dossier can report an appearance but not edit it — DISCOGRAPHY owns the
   * running order, and it is the only surface that can see the whole of it. So
   * the control leaves: it addresses the release in the URL and the operator
   * lands on it, which also closes this sheet, because the ARCHIVE's open
   * dossier is itself a URL parameter.
   *
   * `?release=<id>` is the same shape as the `?project=<id>` that opened this
   * record. Two record surfaces, addressed the same way.
   */
  const navigate = useNavigate()
  const primary = project.sets.find((set) => set.isPrimary) ?? project.sets[0] ?? null
  const analysis = primary?.analysis ?? null

  /*
   * The history is trimmed for display, not scrolled.
   *
   * It grows on every stage change and never shrinks, so it has to be bounded
   * somehow. Giving the list its own scrollbar was the obvious answer and the
   * wrong one: the dossier body scrolls too, so a long history put two
   * scrollbars on screen a few pixels apart, which reads as broken however
   * carefully the cap is tuned. Rendering a fixed number of rows bounds the
   * panel without ever introducing a second scroller.
   *
   * Ten here rather than the six it showed on OVERVIEW. This tab is where
   * someone comes *for* the detail, and the pipeline is eight stages — six
   * rows could not even show one pass through it. The remainder is still
   * counted rather than hidden silently, and the record itself stays complete
   * in the database.
   */
  const recentHistory = [...project.stageHistory].reverse().slice(0, HISTORY_SHOWN)
  const earlierCount = Math.max(project.stageHistory.length - HISTORY_SHOWN, 0)

  /*
   * RELEASES is conditional, so the panel after it has to renumber.
   *
   * The design language numbers every panel, and a tab reading 01, 02, 03, 05
   * says a section is missing rather than that it was never drawn — which is
   * exactly the wrong thing to say about a project that simply has not been
   * released. Counted rather than hard-coded so this cannot drift again.
   */
  const onRelease = artists.appearances.length > 0

  return (
    <DossierGrid>
      <Panel label="Set analysis" index="01" className={styles.span4} focal>
        {analysis ? (
          <div className={styles.stack}>
            <FieldGrid columns={4}>
              <Field
                label="Signature"
                value={
                  analysis.timeSignature
                    ? `${analysis.timeSignature.numerator}/${analysis.timeSignature.denominator}`
                    : '—'
                }
                mono
              />
              <Field label="Tracks" value={analysis.trackCounts.total || '—'} mono />
              <Field
                label="MIDI / audio"
                value={`${analysis.trackCounts.midi} / ${analysis.trackCounts.audio}`}
                mono
              />
              <Field label="Scenes" value={analysis.sceneCount || '—'} mono />
              <Field label="Samples" value={analysis.sampleCount || '—'} mono />
            </FieldGrid>

            <div className={styles.stackTight}>
              <span className={styles.sectionLabel}>
                Plugins {analysis.plugins.length > 0 ? `· ${analysis.plugins.length}` : ''}
              </span>
              {analysis.plugins.length === 0 ? (
                <p className={styles.empty}>
                  No third-party plugins found. Live&apos;s own devices are not enumerated.
                </p>
              ) : (
                <div className={styles.tokens}>
                  {analysis.plugins.map((plugin) => (
                    <span key={plugin} className={styles.token}>
                      {plugin}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {analysis.missingSamples.length > 0 ? (
              <p className={styles.warn}>
                {analysis.missingSamples.length} referenced sample
                {analysis.missingSamples.length === 1 ? '' : 's'} could not be found on disk. See
                the FILES tab.
              </p>
            ) : null}

            {analysis.parseError ? (
              <p className={styles.warn}>
                This set could only be read in part: {analysis.parseError}
              </p>
            ) : null}

            <p className={styles.hint}>
              {analysis.creator ?? 'Unknown Live version'}
              {primary ? ` · ${primary.fileName} · ${formatBytes(primary.sizeBytes)}` : ''}
            </p>
          </div>
        ) : (
          <p className={styles.empty}>
            No Ableton set was found in this folder, so there is nothing to analyse.
          </p>
        )}
      </Panel>

      <Panel label="Register" index="02" className={styles.span2}>
        <FieldGrid columns={1}>
          <Field label="Stage" value={getStage(project.stage).label} />
          <Field label="Purpose" value={getStage(project.stage).purpose} />
          <Field label="Category" value={PROJECT_CATEGORY_LABEL[project.category]} />
          <Field label="Last touched" value={formatStamp(project.lastTouchedAt)} mono />
        </FieldGrid>
      </Panel>

      <Panel label="On disk" index="03" className={styles.span3}>
        <div className={styles.stack}>
          <FieldGrid columns={1}>
            {/*
              Selectable rather than a button, unlike the masthead version it
              replaces. A path in a record is something you copy into a terminal
              or a bug report at least as often as you open; REVEAL is the
              explicit control beneath, so the text itself can stay text.
            */}
            <Field label="Location" value={project.path} mono selectable />
          </FieldGrid>

          <FieldGrid columns={3}>
            <Field label="Folder size" value={formatBytes(project.sizeBytes)} mono />
            <Field label="Sets" value={project.sets.length} mono />
            <Field label="Revisions" value={project.revisions.length} mono />
            <Field
              label="Imported samples"
              value={project.sampleFileCount || '—'}
              mono
              hint="Under the project's Samples folder"
            />
            <Field label="Indexed" value={formatStamp(project.scannedAt)} mono />
          </FieldGrid>

          <div className={styles.actions}>
            <Button
              size="sm"
              disabled={project.missing}
              {...tooltipTrigger(
                project.missing ? 'The folder is not on disk' : 'Show the folder in Explorer'
              )}
              onClick={() => shell.reveal(project.path)}
            >
              Reveal in Explorer
            </Button>
          </div>
        </div>
      </Panel>

      {/*
        Where this project ended up, and which file went out as it.
        This panel is the ARCHIVE's read of a link it does not own. DISCOGRAPHY
        holds the tracklist and the master pick — see `ReleaseTrackSchema` for
        why the link runs one way — so everything here reports and nothing
        edits. Editing the running order needs to see the whole order, which
        is the one thing this side cannot.

        It sits in RECORD rather than OVERVIEW because an appearance is read
        deliberately, not written, which is the altitude rule the dossier
        follows throughout. It spent a release in OVERVIEW's credits panel,
        where it was the only read-only thing on a tab of writable fields.

        Drawn only when there is something to draw. Most projects are not on a
        release, and an empty slab saying so on every one of them would be the
        clutter this tab was split to avoid.

        No icon, deliberately: every other panel here is plain, and `Panel`'s
        icon slot is all-or-nothing by house rule — one iconed slab among four
        reads as an oversight rather than as emphasis.
      */}
      {onRelease ? (
        <Panel
          label="Releases"
          index="04"
          className={styles.span6}
          aside={String(artists.appearances.length)}
        >
          <ul className={styles.appearances}>
            {artists.appearances.map((entry) => (
              <li key={`${entry.releaseId}-${entry.trackId}`} className={styles.appearance}>
                <span className={styles.appearanceHead}>
                  <span className={styles.appearanceMark}>◆</span>
                  <span className={styles.appearanceTitle}>
                    Track {entry.position} of <strong>{entry.title}</strong>
                  </span>
                  <span className={styles.appearanceMeta}>
                    {[
                      RELEASE_KIND_LABEL[entry.kind],
                      RELEASE_STATUS_LABEL[entry.status],
                      entry.releaseDate ? formatIsoDate(entry.releaseDate) : null
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>

                  <Button
                    size="sm"
                    variant="ghost"
                    className={styles.appearanceOpen}
                    {...tooltipTrigger('Open this release in DISCOGRAPHY')}
                    onClick={() => navigate(`/discography?release=${entry.releaseId}`)}
                  >
                    Open in DISCOGRAPHY
                  </Button>
                </span>

                {/*
                  The file that shipped, and the way to it.

                  This is the half of the arrangement that makes referencing
                  the master in place worth doing rather than moving it: the
                  release names a bounce that is still sitting beside the set
                  that made it, so the dossier can point straight at the
                  source instead of at a copy in another directory.
                */}
                {entry.master ? (
                  <span className={styles.appearanceMaster}>
                    <span className={styles.appearanceFile} {...tooltipTrigger(entry.master.path)}>
                      {entry.master.fileName}
                    </span>
                    <span className={styles.appearanceSize}>
                      {formatBytes(entry.master.sizeBytes)}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      {...tooltipTrigger(entry.master.path)}
                      onClick={() => shell.reveal(entry.master!.path)}
                    >
                      Reveal
                    </Button>
                  </span>
                ) : (
                  <span className={styles.appearanceNone}>
                    No release master chosen. Pick one on the track in DISCOGRAPHY.
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel label="Stage history" index={onRelease ? '05' : '04'} className={styles.span3}>
        {project.stageHistory.length === 0 ? (
          <p className={styles.empty}>No stage changes recorded.</p>
        ) : (
          <div className={styles.history}>
            {recentHistory.map((event, index) => (
              <div key={`${event.at}-${index}`} className={styles.event}>
                <span className={styles.eventStamp}>{formatStamp(event.at)}</span>
                <span>
                  {getStage(event.stage).label}
                  {event.note ? <span className={styles.eventNote}> — {event.note}</span> : null}
                </span>
              </div>
            ))}

            {earlierCount > 0 ? (
              <p className={styles.historyMore}>
                + {earlierCount} earlier change{earlierCount === 1 ? '' : 's'}
              </p>
            ) : null}
          </div>
        )}
      </Panel>
    </DossierGrid>
  )
}
