import { useState, type ReactNode } from 'react'
import { useDialogKeys } from '@renderer/hooks/useDialogKeys'
import { motion } from 'motion/react'
import { DEFAULT_FOLDER_COLOUR } from '@shared/domain/stacks.constants'
import type { VolumeKind } from '@shared/domain/volumes'
import {
  VOLUME_KINDS,
  VOLUME_KIND_LABEL,
  VOLUME_KIND_PURPOSE,
  validateVolumeTitle
} from '@shared/domain/volumes.constants'
import { Portal } from '@renderer/components/primitives/Portal'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import { SwatchPicker } from '../stacks/SwatchPicker'
import styles from '../stacks/stacks.module.scss'

export interface VolumeDialogProps {
  mode: 'create' | 'edit'
  initialKind?: VolumeKind
  initialTitle?: string
  initialArtist?: string
  initialColour?: string
  /** Tracks currently on it, so an edit can warn before re-categorising them. */
  trackCount?: number
  busy?: boolean
  error?: string | null
  onSubmit: (draft: { kind: VolumeKind; title: string; artist: string; colour: string }) => void
  onCancel: () => void
}

/**
 * Create or edit a volume.
 *
 * The one dialog in the department that makes nothing on disk, and it says so:
 * a volume is a statement that some tracks are one work, not a place to put
 * them. Without that line the operator would reasonably expect an album folder
 * to appear somewhere.
 *
 * Title validation is deliberately looser than a folder's — none of the
 * filesystem's rules about colons or trailing dots apply to something that
 * never becomes a directory, so `AUX: VOL. 2` is a perfectly good album name.
 */
export function VolumeDialog({
  mode,
  initialKind = 'album',
  initialTitle = '',
  initialArtist = '',
  initialColour = DEFAULT_FOLDER_COLOUR,
  trackCount = 0,
  busy = false,
  error = null,
  onSubmit,
  onCancel
}: VolumeDialogProps): ReactNode {
  const [kind, setKind] = useState<VolumeKind>(initialKind)
  const [title, setTitle] = useState(initialTitle)
  const [artist, setArtist] = useState(initialArtist)
  const [colour, setColour] = useState(initialColour)

  const verdict = validateVolumeTitle(title)
  const canSubmit = verdict.ok && !busy
  const recategorising = mode === 'edit' && kind !== initialKind && trackCount > 0

  const submit = (): void => {
    if (canSubmit) onSubmit({ kind, title: title.trim(), artist: artist.trim(), colour })
  }

  useDialogKeys({ onCommit: submit, onCancel, canCommit: canSubmit })

  return (
    <Portal>
      <div
        className={styles.scrim}
        role="presentation"
        onClick={(event) => {
          if (event.target === event.currentTarget) onCancel()
        }}
      >
        <motion.div
          className={styles.dialog}
          role="dialog"
          aria-modal="true"
          aria-label={mode === 'create' ? 'Create a volume' : 'Edit volume'}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <header className={styles.dialogHead}>
            <span className={styles.dialogTitle}>
              {mode === 'create' ? 'New volume' : 'Edit volume'}
            </span>
            <span className={styles.dialogWhere}>Metadata only — nothing is created on disk</span>
          </header>

          <div className={styles.dialogBody}>
            <div className={styles.field}>
              <span className={styles.pickerLabel}>Kind</span>
              <div className={styles.chipRow} role="group" aria-label="Volume kind">
                {VOLUME_KINDS.map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    className={styles.chip}
                    data-selected={kind === entry || undefined}
                    aria-pressed={kind === entry}
                    title={VOLUME_KIND_PURPOSE[entry]}
                    onClick={() => setKind(entry)}
                  >
                    {VOLUME_KIND_LABEL[entry]}
                  </button>
                ))}
              </div>
            </div>

            <TextInput
              label="Title"
              value={title}
              onChange={setTitle}
              placeholder="Nightfall"
              maxLength={120}
              hint={title.length > 0 && !verdict.ok ? (verdict.reason ?? undefined) : undefined}
            />

            <TextInput
              label="Artist"
              value={artist}
              onChange={setArtist}
              placeholder="Optional"
              maxLength={120}
            />

            <SwatchPicker value={colour} onChange={setColour} subject="Volume" />

            {/*
            Changing the kind rewrites every track's category, which is a
            consequence the operator cannot see from here — so it is stated
            before they commit rather than reported afterwards.
          */}
            {recategorising ? (
              <p className={styles.confirmDetail}>
                {trackCount} track{trackCount === 1 ? '' : 's'} will be re-categorised as{' '}
                {VOLUME_KIND_LABEL[kind]}.
              </p>
            ) : null}

            {error ? (
              <p className={styles.dialogError} role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className={styles.dialogActions}>
            <Button size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              busy={busy}
              disabled={!canSubmit}
              onClick={() => {
                if (canSubmit)
                  onSubmit({ kind, title: title.trim(), artist: artist.trim(), colour })
              }}
            >
              {mode === 'create' ? 'Create' : 'Save'}
            </Button>
          </div>
        </motion.div>
      </div>
    </Portal>
  )
}
