import { useState, type ReactNode } from 'react'
import { getStage } from '@shared/domain/projects.constants'
import { Button } from '@renderer/components/primitives/Button'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { Panel } from '@renderer/components/primitives/Panel'
import { TextArea } from '@renderer/components/primitives/Input'
import { formatBytes } from '@renderer/lib/format'
import { formatKey, formatLength, formatStamp, formatTempo } from '../../lib/present'
import type { DossierTabProps } from './types'
import { DossierGrid } from './DossierGrid'
import styles from './dossier.module.scss'

/**
 * What the project *is*: the facts read out of the set, the operator's notes,
 * and how it arrived at its current stage.
 */
export function DossierOverview({ project, mutations }: DossierTabProps): ReactNode {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  const primary = project.sets.find((set) => set.isPrimary) ?? project.sets[0] ?? null
  const analysis = primary?.analysis ?? null

  const submitNote = (): void => {
    if (!draft.trim()) return
    mutations.addNote.mutate({ id: project.id, draft: { body: draft } })
    setDraft('')
  }

  return (
    <DossierGrid>
      <Panel label="Set analysis" index="01" className={styles.span4} focal>
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
      </Panel>

      <Panel label="Record" index="02" className={styles.span2}>
        <FieldGrid columns={1}>
          <Field label="Stage" value={getStage(project.stage).label} />
          <Field label="Purpose" value={getStage(project.stage).purpose} />
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
            <div className={styles.stackTight}>
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
            {[...project.stageHistory].reverse().map((event, index) => (
              <div key={`${event.at}-${index}`} className={styles.event}>
                <span className={styles.eventStamp}>{formatStamp(event.at)}</span>
                <span>
                  {getStage(event.stage).label}
                  {event.note ? <span className={styles.eventNote}> — {event.note}</span> : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </DossierGrid>
  )
}
