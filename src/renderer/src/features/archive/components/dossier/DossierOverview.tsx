import { useState, type ReactNode } from 'react'
import { PROJECT_CATEGORY_LABEL, getStage } from '@shared/domain/projects.constants'
import { Button } from '@renderer/components/primitives/Button'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { Panel } from '@renderer/components/primitives/Panel'
import { ArchiveIcon } from '../icons/ArchiveIcon'
import { TextArea } from '@renderer/components/primitives/Input'
import { formatBytes } from '@renderer/lib/format'
import { formatKey, formatLength, formatStamp, formatTempo } from '../../lib/present'
import type { DossierTabProps } from './types'
import { DossierGrid } from './DossierGrid'
import styles from './dossier.module.scss'

/** Stage-history rows drawn before the rest are summarised. See `recentHistory`. */
const HISTORY_SHOWN = 6

/**
 * What the project *is*: the facts read out of the set, the operator's notes,
 * and how it arrived at its current stage.
 */
export function DossierOverview({ project, mutations, open }: DossierTabProps): ReactNode {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

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
   * Six covers the recent past — the pipeline is eight stages, and what matters
   * here is what happened lately. The remainder is counted rather than hidden
   * silently, and the record itself stays complete in the database.
   */
  const recentHistory = [...project.stageHistory].reverse().slice(0, HISTORY_SHOWN)
  const earlierCount = Math.max(project.stageHistory.length - HISTORY_SHOWN, 0)

  const submitNote = (): void => {
    if (!draft.trim()) return
    mutations.addNote.mutate({ id: project.id, draft: { body: draft } })
    setDraft('')
  }

  return (
    <DossierGrid>
      <Panel label="Set analysis" index="01" className={styles.span4} focal>
        {/*
          A column filling the panel, so the open row below can be pushed to the
          foot with `margin-top: auto`. The Panel's own body is `flex: 1` but is
          not itself a flex container, and it is shared by every panel in the
          app — giving it a direction here would move the furniture everywhere.
        */}
        <div className={styles.analysisBody}>
          {analysis ? (
            <div className={styles.stack}>
              <FieldGrid columns={4}>
                <Field label="Tempo" value={formatTempo(analysis.tempo)} mono />
                <Field
                  label="Signature"
                  value={
                    analysis.timeSignature
                      ? `${analysis.timeSignature.numerator}/${analysis.timeSignature.denominator}`
                      : '—'
                  }
                  mono
                />
                <Field
                  label="Key"
                  value={formatKey(analysis.key)}
                  mono
                  hint={
                    analysis.key
                      ? analysis.inKey
                        ? undefined
                        : "Live's In Key filter is off for this set"
                      : 'Sets saved before Live 12 carry no song key'
                  }
                />
                <Field
                  label="Length"
                  value={formatLength(analysis.arrangementSeconds)}
                  mono
                  hint="Estimated from the furthest clip"
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

          {/*
          The two actions the panel exists to lead to, at the foot of it.

          They started in the dossier's header bar, next to CLOSE, which put the
          most-used controls in the corner that also holds the way out. Bottom
          right of the focal panel instead: it is where a reader's eye finishes
          the set analysis, and where a dialogue puts its commit.

          Marked, and OPEN IN ABLETON carries the accent. Two identical ghost
          buttons in a row of grey read as chrome and get skipped — the point of
          this row is that it should be the first thing seen, so it gets the one
          saturated colour the panel is allowed.
        */}
          <div className={styles.openRow}>
            <Button
              size="sm"
              icon={<ArchiveIcon mark="folder" className={styles.openIcon} />}
              disabled={open.missing}
              title={open.missing ? 'The folder is not on disk' : 'Open the project folder'}
              onClick={open.folder}
            >
              Open folder
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<ArchiveIcon mark="project" className={styles.openIcon} />}
              disabled={open.missing || open.setless}
              title={
                open.setless ? 'No Ableton set in this project' : 'Open the set in Ableton Live'
              }
              onClick={open.ableton}
            >
              Open in Ableton
            </Button>
          </div>
        </div>
      </Panel>

      <Panel label="Record" index="02" className={styles.span2}>
        <FieldGrid columns={1}>
          <Field label="Stage" value={getStage(project.stage).label} />
          <Field label="Purpose" value={getStage(project.stage).purpose} />
          <Field label="Category" value={PROJECT_CATEGORY_LABEL[project.category]} />
          <Field label="Last touched" value={formatStamp(project.lastTouchedAt)} mono />
          <Field label="Indexed" value={formatStamp(project.scannedAt)} mono />
          <Field label="Folder size" value={formatBytes(project.sizeBytes)} mono />
          <Field
            label="Imported samples"
            value={project.sampleFileCount || '—'}
            mono
            hint="Files under the project's Samples folder"
          />
        </FieldGrid>
      </Panel>

      <Panel
        label="Notes"
        index="03"
        className={styles.span4}
        aside={project.notes.length > 0 ? String(project.notes.length) : undefined}
      >
        <div className={styles.stack}>
          <div>
            <TextArea
              label="Add a note"
              value={draft}
              onChange={setDraft}
              rows={3}
              placeholder="What needs doing, what was tried, what to remember"
            />
            <div className={styles.actions}>
              <Button
                variant="primary"
                size="sm"
                onClick={submitNote}
                busy={mutations.addNote.isPending}
                disabled={draft.trim().length === 0}
              >
                File note
              </Button>
            </div>
          </div>

          {project.notes.length === 0 ? (
            <p className={styles.empty}>No notes on this project yet.</p>
          ) : (
            <div className={styles.noteList}>
              {project.notes.map((note) => (
                <div key={note.id} className={styles.note} data-pinned={note.pinned || undefined}>
                  {editing === note.id ? (
                    <>
                      <TextArea label="Note" value={editDraft} onChange={setEditDraft} rows={3} />
                      <div className={styles.actions}>
                        <Button
                          variant="primary"
                          size="sm"
                          busy={mutations.updateNote.isPending}
                          onClick={() => {
                            mutations.updateNote.mutate({
                              id: project.id,
                              noteId: note.id,
                              draft: { body: editDraft, pinned: note.pinned }
                            })
                            setEditing(null)
                          }}
                        >
                          Save
                        </Button>
                        <Button size="sm" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className={styles.noteBody}>{note.body}</p>
                      <div className={styles.noteFoot}>
                        <span>{formatStamp(note.createdAt)}</span>
                        {note.updatedAt !== note.createdAt ? <span>EDITED</span> : null}
                        <button
                          type="button"
                          className={styles.noteAction}
                          onClick={() =>
                            mutations.updateNote.mutate({
                              id: project.id,
                              noteId: note.id,
                              draft: { body: note.body, pinned: !note.pinned }
                            })
                          }
                        >
                          {note.pinned ? 'UNPIN' : 'PIN'}
                        </button>
                        <button
                          type="button"
                          className={styles.noteAction}
                          onClick={() => {
                            setEditing(note.id)
                            setEditDraft(note.body)
                          }}
                        >
                          EDIT
                        </button>
                        <button
                          type="button"
                          className={styles.noteAction}
                          data-danger
                          onClick={() =>
                            mutations.deleteNote.mutate({ id: project.id, noteId: note.id })
                          }
                        >
                          DELETE
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Panel label="Stage history" index="04" className={styles.span2}>
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
