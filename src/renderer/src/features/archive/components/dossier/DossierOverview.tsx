import { useMemo, useState, type ReactNode } from 'react'
import { notify } from '@renderer/components/feedback/notify'
import { evaluateReadiness, getStage, namesMaster } from '@shared/domain/projects.constants'
import { Button } from '@renderer/components/primitives/Button'
import { Panel } from '@renderer/components/primitives/Panel'
import { TextArea } from '@renderer/components/primitives/Input'
import { useStacksTree } from '@renderer/hooks/useStacks'
import { useResolvedTags } from '@renderer/hooks/useTags'
import { formatStamp } from '../../lib/present'
import { ArchiveGlyph } from '../icons/ArchiveGlyph'
import { StageStrip } from '../StageStrip'
import { TagPicker } from '../tags/TagPicker'
import { TagManagerDialog } from '../tags/TagManagerDialog'
import { FinalMaster } from './FinalMaster'
import type { DossierTabProps } from './types'
import { DossierGrid } from './DossierGrid'
import styles from './dossier.module.scss'

/** The file's own name, for saying which bounce was chosen. */
function basename(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

/**
 * What the operator has said about this project — and nothing else.
 *
 * One panel, down from four. The tab used to carry the complete set analysis,
 * the complete register entry, the notes and the stage history, so opening a
 * project to check its tempo presented about thirty figures with that one
 * somewhere among them.
 *
 * It then carried two, after the detail moved to RECORD: a SET panel holding
 * tempo, key and length, beside this one. That panel is now gone too, and the
 * reasoning is worth keeping. Three numbers do not need a slab, a heading and
 * an index to be read — they are headline facts and now sit under the title
 * where the folder path used to be. Giving them a panel of their own cost
 * half the tab's width, which pushed the only thing on it the operator
 * actually *writes* into down a narrow column.
 *
 * So OVERVIEW is a working surface rather than a summary. What is read at a
 * glance lives in the masthead; what is read deliberately lives in RECORD;
 * what is *written* lives here.
 *
 * Which is why the stage came here too. It spent four attempts as a control
 * in the masthead and never looked at home in any of them, because the
 * masthead is for reading and a stage is something the operator *states* —
 * the same kind of mark as a tag or a note, and now filed beside them.
 */
export function DossierOverview({
  project,
  mutations,
  tags,
  artists,
  setStage
}: DossierTabProps): ReactNode {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [managing, setManaging] = useState(false)

  /*
   * FINAL MASTER is conditional, so everything after it renumbers.
   *
   * The design language numbers every panel, and a tab reading 01, 03, 04
   * says a section is missing rather than that it was never drawn — exactly
   * the wrong thing to say about a project that is not finished yet. The same
   * fix RECORD's RELEASES panel needed.
   */
  const asksMaster = namesMaster(project.stage)
  const index = (position: number): string =>
    String(asksMaster ? position : position - 1).padStart(2, '0')

  /*
   * Stage changes go straight through; the service holds the one gate.
   *
   * TRACK READY used to intercept here, opening a file picker instead of
   * moving the stage, because reaching it required a final master. It does not
   * any more — TRACK READY is the operator's own statement that the work is
   * finished, like the tags and notes beside it.
   *
   * **RELEASED is the stage that is gated now**, and the refusal comes from
   * `applyStageChange` rather than from a dialog raised here. That is the
   * right place for it: the same rule has to hold when DISCOGRAPHY moves the
   * project without anybody opening this tab. The FINAL MASTER panel below
   * says what is missing before the button is ever pressed, which is what
   * stops the refusal being the way the operator finds out.
   *
   * RELEASED is usually not set here at all — putting a release out in
   * DISCOGRAPHY moves every project it credits. This control is the manual
   * path for back catalogue that has no entry to be moved by.
   */

  /** What the final stage is still waiting on. Empty once the project is ready. */
  const outstanding = useMemo(
    () => evaluateReadiness(project).filter((item) => !item.met),
    [project]
  )

  /*
   * The shelf this project is filed on, by name.
   *
   * Only for the picker: it groups that shelf's own tags first and becomes the
   * home shelf of anything created from here. A project filed nowhere simply
   * gets no group heading — tags are global, so nothing is unreachable either
   * way. See tags.constants.ts for why the link is advisory.
   */
  const { data: tree } = useStacksTree()
  const homeFolderName = useMemo(() => {
    if (project.folderId === null) return null
    return tree?.folders.find((folder) => folder.id === project.folderId)?.name ?? null
  }, [tree, project.folderId])

  const carried = useResolvedTags(project.tagIds, tags.library)

  const submitNote = (): void => {
    if (!draft.trim()) return
    mutations.addNote.mutate({ id: project.id, draft: { body: draft } })
    setDraft('')
  }

  const toggleTag = (tagId: string, next: boolean): void => {
    const tagIds = next ? [...project.tagIds, tagId] : project.tagIds.filter((id) => id !== tagId)
    mutations.patch.mutate({ id: project.id, patch: { tagIds } })
  }

  /*
   * Creating attaches in the same call rather than creating and then patching.
   * Two round trips would leave a tag in the library attached to nothing
   * whenever the second failed. See `TagDraft.attachTo`.
   */
  const createTag = (name: string, colour: string | null): void => {
    tags.mutations.create.mutate({
      name,
      // Omitted rather than nulled when the operator chose ANY: the draft
      // treats an absent colour as "roll one", and sending null would fail
      // the schema's hex check.
      ...(colour ? { colour } : {}),
      folderId: project.folderId,
      attachTo: project.id
    })
  }

  const tagsBusy =
    mutations.patch.isPending || tags.mutations.create.isPending || tags.mutations.remove.isPending

  return (
    <DossierGrid>
      {/*
        Two panels rather than one, and they are the pair the tab exists for:
        everything here is the operator's own mark on the record, as against
        everything the scanner read off disk. They are the only two fields in
        the whole dossier a rescan can never overwrite.

        They were briefly one panel called MARGINALIA holding both — stacked
        at first, then in two columns. The columns were right about the
        layout and wrong about the object: a shared heading implied tags and
        notes were one thing being shown two ways, when they are two things
        that happen to belong to the same hand. Separate panels say that, and
        each gets its own count in its own corner.
      */}
      {/*
        First, and spanning the tab, because it is the one thing here that
        says where the work has got to. The masthead reads the stage out;
        this is where it is set.
      */}
      <Panel
        label="Stage"
        index="01"
        icon={<ArchiveGlyph name="history" />}
        className={styles.span6}
      >
        <StageStrip stage={project.stage} busy={mutations.patch.isPending} onChange={setStage} />

        {/*
          What TRACK READY is still waiting on, named before it is needed.

          One item — being filed. The final master is *not* listed here, and
          that is deliberate: it gates RELEASED rather than TRACK READY, and it
          has a panel of its own directly below that says so. Naming it twice
          would imply two requirements.

          Hidden once everything is met: a checklist of satisfied requirements
          is a report nobody asked for, and this panel is about where the work
          has got to rather than about itself.
        */}
        {outstanding.length > 0 ? (
          <div className={styles.readiness}>
            <span className={styles.readinessLabel}>{getStage('ready').label} still needs</span>
            <ul className={styles.readinessList}>
              {outstanding.map((item) => (
                <li key={item.id} className={styles.readinessItem}>
                  <span className={styles.readinessName}>{item.label}</span>
                  {item.hint ? <span className={styles.readinessHint}>{item.hint}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>

      {/*
        MIX AND MASTER stood here, and has been removed outright.

        It asked the operator to classify every bounce as a WIP, a mix or a
        master, and then to promote one of them to the final that shipped —
        which moved the file out of the project folder into
        `Release Mastered Tracks`.

        None of that is asked any more. The file that ships is named on the
        DISCOGRAPHY track that ships it, referenced where it already sits, and
        the RECORD tab reports it. This tab is for what the operator writes
        about the work; which file a release used is a fact about the release.

        The marks already made are still in the database and nothing reads
        them. See docs/DISCOGRAPHY.md, decision D5.

        What stands in its place asks one question instead of four, and
        answers it without touching the disk — see `FinalMaster`.
      */}
      {asksMaster ? (
        <FinalMaster
          project={project}
          busy={mutations.setFinalMaster.isPending}
          onChoose={(path) =>
            mutations.setFinalMaster.mutate(
              { id: project.id, path },
              {
                /*
                 * Naming a master raises a single in DISCOGRAPHY; clearing one
                 * withdraws that single again, unless it has been adopted.
                 *
                 * Neither was said anywhere on this side. The entry simply
                 * appeared in another department, to be discovered by going
                 * there — and clearing the field is one unconfirmed click that
                 * can delete a catalogue entry the operator never made.
                 */
                onSuccess: () => {
                  if (path === null) {
                    notify.report('Final master cleared', {
                      detail:
                        'Any single raised for this project, and not since edited, has been withdrawn from DISCOGRAPHY.'
                    })
                    return
                  }

                  notify.report('Final master named', {
                    detail: `${basename(path)} is what ships. A single has been raised in DISCOGRAPHY — adopt it there to edit it.`
                  })
                }
              }
            )
          }
        />
      ) : null}

      {/*
        CREDITS, beside TAGS and NOTES.
        The third thing on this tab that is the operator's own statement about
        the work rather than something the scanner read off disk — which is
        the rule the tab already follows. Who was in the room is not in the
        `.als`, and no rescan will ever overwrite it.

        Deliberately not the same thing as the shelf the project sits on, even
        when that shelf is an ARTIST folder: a track can credit four people
        while living in one directory. See docs/DISCOGRAPHY.md, decision D3.
      */}
      <Panel
        label="Credits"
        index={index(3)}
        icon={<ArchiveGlyph name="tag" />}
        className={styles.span6}
        aside={project.artistIds.length > 0 ? String(project.artistIds.length) : undefined}
      >
        {artists.roster.length === 0 ? (
          <p className={styles.empty}>
            Nobody on the roster yet. Add the people you work with in ARTISTS and they can be
            credited here.
          </p>
        ) : (
          <div className={styles.credits}>
            {artists.roster.map((artist) => {
              const credited = project.artistIds.includes(artist.id)
              return (
                <button
                  key={artist.id}
                  type="button"
                  className={styles.creditChip}
                  data-on={credited || undefined}
                  aria-pressed={credited}
                  disabled={mutations.patch.isPending}
                  onClick={() =>
                    mutations.patch.mutate({
                      id: project.id,
                      patch: {
                        artistIds: credited
                          ? project.artistIds.filter((entry) => entry !== artist.id)
                          : [...project.artistIds, artist.id]
                      }
                    })
                  }
                >
                  {artist.name}
                </button>
              )
            })}
          </div>
        )}

        {/*
          The appearance list has moved to RECORD.

          It was here, under the credits, and it was the wrong altitude: an
          appearance is *read*, not written, and this tab is the one the
          dossier reserves for what the operator states about the work. RECORD
          is where everything read deliberately lives, and it is also where
          docs/DISCOGRAPHY.md §7 always said this belonged.
        */}
      </Panel>

      <Panel
        label="Tags"
        index={index(4)}
        icon={<ArchiveGlyph name="tag" />}
        className={styles.span3}
        aside={carried.length > 0 ? String(carried.length) : undefined}
      >
        <TagPicker
          tags={carried}
          library={tags.library}
          homeFolderId={project.folderId}
          homeFolderName={homeFolderName}
          busy={tagsBusy}
          onToggle={toggleTag}
          onCreate={createTag}
          onManage={() => setManaging(true)}
        />
      </Panel>

      <Panel
        label="Notes"
        index={index(5)}
        icon={<ArchiveGlyph name="note" />}
        className={styles.span3}
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
                icon={<ArchiveGlyph name="note" />}
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
                        <span className={styles.noteStamp}>{formatStamp(note.createdAt)}</span>
                        {note.updatedAt !== note.createdAt ? (
                          <span className={styles.noteStamp}>EDITED</span>
                        ) : null}

                        {/*
                          Pushed to the trailing edge and boxed. Left of the
                          timestamp and unboxed they were three more scraps of
                          grey caption in a row that already had two, and
                          nothing about them said they could be pressed.
                        */}
                        <div className={styles.noteActions}>
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
                            <ArchiveGlyph name="pin" className={styles.noteActionGlyph} />
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
                            <ArchiveGlyph name="edit" className={styles.noteActionGlyph} />
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
                            <ArchiveGlyph name="cross" className={styles.noteActionGlyph} />
                            DELETE
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      {managing ? (
        <TagManagerDialog
          library={tags.library}
          busy={tags.mutations.update.isPending || tags.mutations.remove.isPending}
          onRename={(id, name) => tags.mutations.update.mutate({ id, patch: { name } })}
          onRecolour={(id, colour) => tags.mutations.update.mutate({ id, patch: { colour } })}
          onDelete={(id) => tags.mutations.remove.mutate(id)}
          onClose={() => setManaging(false)}
        />
      ) : null}
    </DossierGrid>
  )
}
