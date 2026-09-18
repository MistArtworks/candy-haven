import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { ArtistLink, ArtistPatch, ArtistRole, ArtistSummary } from '@shared/domain/artists'
import {
  ARTIST_ROLES,
  ARTIST_ROLE_LABEL,
  MAX_ARTIST_LINKS,
  MAX_ARTIST_NAME,
  MAX_ARTIST_REAL_NAME
} from '@shared/domain/artists.constants'
import { useBackdropDismiss } from '@renderer/hooks/useBackdropDismiss'
import { Portal } from '@renderer/components/primitives/Portal'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { Plate } from '@renderer/components/primitives/Plate'
import { initialsOf } from '@renderer/lib/initials'
import { useEchoedText } from '@renderer/hooks/useEchoedText'
import { SwatchPicker } from '@renderer/features/archive/components/stacks/SwatchPicker'
import { LinkEditor } from './LinkEditor'
import styles from '../ArtistsPage.module.scss'

export interface ArtistSheetProps {
  artist: ArtistSummary
  busy: boolean
  error: string | null
  onPatch: (patch: ArtistPatch) => void
  onSetPicture: (sourcePath: string | null) => void
  onRemove: () => void
  onClose: () => void
}

/**
 * One artist's record, opened as a sheet.
 *
 * Portalled, as every overlay a page draws must be: `ConsoleLayout` animates
 * the page with a transform, and a transform makes its element the containing
 * block for every `position: fixed` descendant — so a sheet rendered inside
 * the page would centre on the page box rather than the viewport. See
 * `Portal` for the full account.
 *
 * Everything here writes immediately. There is no save button and no unsaved
 * bar, which is the opposite of REGULATION and the right call for this
 * department: a roster entry is a small record edited in passing, usually
 * while doing something else, and a form that has to be committed is one the
 * operator abandons half-finished. The text fields debounce through
 * `useEchoedText`, so a burst of typing is one write.
 */
export function ArtistSheet({
  artist,
  busy,
  error,
  onPatch,
  onSetPicture,
  onRemove,
  onClose
}: ArtistSheetProps): ReactNode {
  const [confirming, setConfirming] = useState(false)
  /*
   * Pressing the scrim closes, but a text selection dragged out of a field
   * and released on it must not — see `useBackdropDismiss`.
   */
  const dismiss = useBackdropDismiss(onClose)

  const [name, setName] = useEchoedText(artist.name, (value) => {
    if (value.trim()) onPatch({ name: value })
  })
  const [realName, setRealName] = useEchoedText(artist.realName, (value) =>
    onPatch({ realName: value })
  )
  const [notes, setNotes] = useEchoedText(artist.notes, (value) => onPatch({ notes: value }))

  const toggleRole = (role: ArtistRole): void => {
    onPatch({
      roles: artist.roles.includes(role)
        ? artist.roles.filter((entry) => entry !== role)
        : [...artist.roles, role]
    })
  }

  const choosePicture = async (): Promise<void> => {
    const path = await window.candy.shell.selectFile({
      title: 'Choose a picture',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif'] }]
    })
    if (path) onSetPicture(path)
  }

  return (
    <Portal>
      <motion.div
        className={styles.sheetBackdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        {...dismiss}
      >
        <motion.section
          className={styles.sheet}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          role="dialog"
          aria-label={artist.name}
          onClick={(event) => event.stopPropagation()}
        >
          <header className={styles.sheetHead}>
            <Plate
              path={artist.picture.copiedPath}
              fallback={initialsOf(artist.name)}
              size={88}
              alt=""
            />

            <div className={styles.sheetTitle}>
              <span className={styles.sheetName}>{artist.name}</span>
              <span className={styles.sheetMeta}>
                {artist.isOperator ? 'THIS IS ME · ' : ''}
                {artist.projectCount} project{artist.projectCount === 1 ? '' : 's'} ·{' '}
                {artist.releaseCount} release{artist.releaseCount === 1 ? '' : 's'}
              </span>
            </div>

            <div className={styles.sheetActions}>
              <Button size="sm" variant="ghost" busy={busy} onClick={() => void choosePicture()}>
                {artist.picture.copiedPath ? 'Replace picture' : 'Add a picture'}
              </Button>
              {artist.picture.copiedPath ? (
                <Button size="sm" variant="ghost" onClick={() => onSetPicture(null)}>
                  Clear
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </header>

          {error ? (
            <p className={styles.sheetError} role="alert">
              {error}
            </p>
          ) : null}

          <div className={styles.sheetBody}>
            <div className={styles.sheetFields}>
              <TextInput
                label="Name"
                value={name}
                onChange={setName}
                maxLength={MAX_ARTIST_NAME}
                hint="Renaming propagates everywhere at once — records hold ids, not names."
              />
              <TextInput
                label="Real name"
                value={realName}
                onChange={setRealName}
                maxLength={MAX_ARTIST_REAL_NAME}
                placeholder="For credits and splits"
              />
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Roles</span>
              <div className={styles.chips}>
                {ARTIST_ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    className={styles.chip}
                    data-on={artist.roles.includes(role) || undefined}
                    aria-pressed={artist.roles.includes(role)}
                    onClick={() => toggleRole(role)}
                  >
                    {ARTIST_ROLE_LABEL[role]}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Links</span>
              <LinkEditor
                links={artist.links}
                max={MAX_ARTIST_LINKS}
                onChange={(links: ArtistLink[]) => onPatch({ links })}
              />
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Notes</span>
              <textarea
                className={styles.notes}
                value={notes}
                rows={4}
                placeholder="How you met, what they play, who to ask."
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

            <SwatchPicker
              value={artist.colour}
              onChange={(colour) => onPatch({ colour })}
              subject="Artist"
            />

            <FieldGrid columns={2}>
              <Field
                label="Picture"
                value={artist.picture.sourcePath ?? 'None'}
                mono
                selectable
                hint={
                  artist.picture.copiedPath
                    ? 'Copied into the archive. The original can be moved or deleted.'
                    : undefined
                }
              />
              <Field
                label="This is me"
                value={
                  <button
                    type="button"
                    className={styles.chip}
                    data-on={artist.isOperator || undefined}
                    aria-pressed={artist.isOperator}
                    onClick={() => onPatch({ isOperator: !artist.isOperator })}
                  >
                    {artist.isOperator ? 'YES' : 'NO'}
                  </button>
                }
              />
            </FieldGrid>
          </div>

          {/*
            Removal, last and separated.
            It reaches beyond the record — it strips credits off every project
            and release naming them — so the confirmation says how many rather
            than asking "are you sure" about a number the operator cannot see.
          */}
          <footer className={styles.sheetFoot}>
            {confirming ? (
              <>
                <span className={styles.confirmText}>
                  Remove {artist.name} from the roster? Their credits come off {artist.projectCount}{' '}
                  project{artist.projectCount === 1 ? '' : 's'} and {artist.releaseCount} release
                  {artist.releaseCount === 1 ? '' : 's'}. No files are touched.
                </span>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Keep
                </Button>
                <Button size="sm" variant="danger" busy={busy} onClick={onRemove}>
                  Remove
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
                Remove from roster
              </Button>
            )}
          </footer>
        </motion.section>
      </motion.div>
    </Portal>
  )
}
