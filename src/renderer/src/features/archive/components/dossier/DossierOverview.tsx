import { useMemo, useState, type ReactNode } from 'react'
import { evaluateReadiness, getStage, marksAudio } from '@shared/domain/projects.constants'
import type { ProjectStage } from '@shared/domain/projects'
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
import { MixAndMaster } from './MixAndMaster'
import { FinalMasterDialog } from './FinalMasterDialog'
import type { DossierTabProps } from './types'
import { DossierGrid } from './DossierGrid'
import styles from './dossier.module.scss'

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
  setStage
}: DossierTabProps): ReactNode {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [managing, setManaging] = useState(false)
  const [shipping, setShipping] = useState(false)
  const [shipError, setShipError] = useState<string | null>(null)
  const [shipBusy, setShipBusy] = useState(false)

  /*
   * TRACK READY asks which file ships instead of refusing because none does.
   *
   * Reaching that stage *is* choosing the final — it means "this is finished",
   * and a project cannot be finished without saying which file is the finished
   * thing. Refusing and sending the operator off to set it first made the
   * stage button a quiz about a step they had not been told to take.
   *
   * Every other stage passes straight through. Re-entering TRACK READY when a
   * final already exists does too: the question has an answer, and asking it
   * again would put a dialog between the operator and a correction.
   */
  const changeStage = (next: ProjectStage): void => {
    if (next === 'ready' && project.masters.final === null) {
      setShipError(null)
      setShipping(true)
      return
    }
    setStage(next)
  }

  const ship = async (sourcePath: string, name: string): Promise<void> => {
    setShipBusy(true)
    setShipError(null)
    try {
      await window.candy.projects.setFinal(project.id, sourcePath, name)
      setShipping(false)
      // Only once the file is actually where it claims to be. A stage saying
      // the work is finished while the move failed is the worse of the two
      // states to be left in.
      setStage('ready')
    } catch (error) {
      setShipError(error instanceof Error ? error.message : String(error))
    } finally {
      setShipBusy(false)
    }
  }

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
        <StageStrip stage={project.stage} busy={mutations.patch.isPending} onChange={changeStage} />

        {/*
          What the last stage is still waiting on, named before it is needed.
          
          The gate already explains itself — pressing TRACK READY without a
          final master returns "pick one in the FILES tab". But that only
          teaches the operator who *tries*, and the honest question they ask
          first is "where do I choose it". The FILES tab's 2/3 badge was the
          only standing answer, and a fraction is not an instruction.
          
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
        Hidden before MIX. There is nothing to mark that early — the bounces
        that matter do not exist yet — and an empty panel on every new project
        is clutter that teaches nothing.
      */}
      {marksAudio(project.stage) ? <MixAndMaster project={project} mutations={mutations} /> : null}

      <Panel
        label="Tags"
        index="03"
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
        index="04"
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

      {shipping ? (
        <FinalMasterDialog
          project={project}
          busy={shipBusy}
          error={shipError}
          onSubmit={(sourcePath, name) => void ship(sourcePath, name)}
          onCancel={() => setShipping(false)}
        />
      ) : null}

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
