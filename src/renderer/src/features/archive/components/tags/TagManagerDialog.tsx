import { useState, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { TagSummary } from '@shared/domain/tags'
import { validateTagName, MAX_TAG_NAME_LENGTH } from '@shared/domain/tags.constants'
import { Portal } from '@renderer/components/primitives/Portal'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import { ArchiveGlyph } from '../icons/ArchiveGlyph'
import { SwatchPicker } from '../stacks/SwatchPicker'
import styles from './tags.module.scss'

export interface TagManagerDialogProps {
  library: readonly TagSummary[]
  busy?: boolean
  error?: string | null
  onRename: (id: string, name: string) => void
  onRecolour: (id: string, colour: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}

/**
 * The tag library: rename, recolour, remove.
 *
 * One dialog for the whole library rather than an edit affordance on each
 * chip. A tag is shared by every project carrying it, so editing one from
 * inside a single project's record would misrepresent the scope of the change
 * — renaming `Deep` there looks local and is not.
 *
 * Renaming needs no confirmation: projects hold tag *ids*, so a rename moves
 * the label everywhere at once and loses nothing. Deleting does, because it is
 * the one action here that reaches out and rewrites records.
 */
export function TagManagerDialog({
  library,
  busy = false,
  error = null,
  onRename,
  onRecolour,
  onDelete,
  onClose
}: TagManagerDialogProps): ReactNode {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)

  const verdict = validateTagName(draft)

  const commitRename = (id: string): void => {
    if (verdict.ok) onRename(id, draft.trim())
    setEditing(null)
  }

  return (
    <Portal>
      <div
        className={styles.scrim}
        role="presentation"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        <motion.div
          className={styles.dialog}
          role="dialog"
          aria-modal="true"
          aria-label="Tag library"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <header className={styles.dialogHead}>
            <span className={styles.dialogTitle}>
              <ArchiveGlyph name="tag" className={styles.dialogGlyph} />
              Tags
            </span>
            <span className={styles.dialogWhere}>
              {library.length} tag{library.length === 1 ? '' : 's'}
            </span>
          </header>

          <div className={styles.dialogBody}>
            {library.length === 0 ? (
              <p className={styles.empty}>
                No tags yet. Open a project and add one from its record.
              </p>
            ) : (
              <ul className={styles.manageList}>
                {library.map((tag) => (
                  <li key={tag.id} className={styles.manageRow}>
                    {editing === tag.id ? (
                      <div className={styles.editor}>
                        <TextInput
                          label="Name"
                          value={draft}
                          onChange={setDraft}
                          maxLength={MAX_TAG_NAME_LENGTH}
                          hint={
                            draft.length > 0 && !verdict.ok
                              ? (verdict.reason ?? undefined)
                              : undefined
                          }
                        />
                        <SwatchPicker
                          value={tag.colour}
                          onChange={(colour) => onRecolour(tag.id, colour)}
                          subject="Tag"
                        />
                        <div className={styles.editorActions}>
                          <Button size="sm" onClick={() => setEditing(null)}>
                            Done
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            busy={busy}
                            disabled={!verdict.ok}
                            onClick={() => commitRename(tag.id)}
                          >
                            Rename
                          </Button>
                        </div>
                      </div>
                    ) : confirming === tag.id ? (
                      /*
                        The count is the whole point of this confirmation.
                        "Delete Deep?" is answerable without knowing anything;
                        "Delete Deep, removing it from 14 projects?" is the
                        question the operator actually needs put to them.
                      */
                      <div className={styles.confirm}>
                        <p className={styles.confirmText}>
                          Delete <strong>{tag.name}</strong>
                          {tag.usageCount > 0
                            ? `, removing it from ${tag.usageCount} project${tag.usageCount === 1 ? '' : 's'}?`
                            : '? Nothing carries it.'}
                        </p>
                        <div className={styles.editorActions}>
                          <Button size="sm" onClick={() => setConfirming(null)}>
                            Keep
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            busy={busy}
                            onClick={() => {
                              onDelete(tag.id)
                              setConfirming(null)
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.manageMain}>
                        <span
                          className={styles.manageDot}
                          style={{ '--tag-colour': tag.colour } as CSSProperties}
                          aria-hidden="true"
                        />
                        <span className={styles.manageName}>{tag.name}</span>
                        <span className={styles.manageCount}>
                          {tag.usageCount} project{tag.usageCount === 1 ? '' : 's'}
                        </span>
                        <button
                          type="button"
                          className={styles.linkAction}
                          onClick={() => {
                            setEditing(tag.id)
                            setDraft(tag.name)
                          }}
                        >
                          <ArchiveGlyph name="edit" className={styles.actionGlyph} />
                          EDIT
                        </button>
                        <button
                          type="button"
                          className={styles.linkAction}
                          data-danger
                          onClick={() => setConfirming(tag.id)}
                        >
                          <ArchiveGlyph name="cross" className={styles.actionGlyph} />
                          DELETE
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {error ? (
              <p className={styles.dialogError} role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className={styles.dialogActions}>
            <Button size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </motion.div>
      </div>
    </Portal>
  )
}
