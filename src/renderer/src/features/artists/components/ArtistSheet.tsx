import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type {
  ArtistCredits,
  ArtistLink,
  ArtistPatch,
  ArtistRole,
  ArtistSummary
} from '@shared/domain/artists'
import {
  ARTIST_ROLES,
  ARTIST_ROLE_LABEL,
  MAX_ARTIST_LINKS,
  MAX_ARTIST_NAME,
  MAX_ARTIST_REAL_NAME,
  SOCIAL_PLATFORM_LABEL
} from '@shared/domain/artists.constants'
import { getStage, PROJECT_CATEGORY_LABEL } from '@shared/domain/projects.constants'
import { RELEASE_KIND_LABEL, RELEASE_STATUS_LABEL } from '@shared/domain/discography.constants'
import { useBackdropDismiss } from '@renderer/hooks/useBackdropDismiss'
import { Portal } from '@renderer/components/primitives/Portal'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { Plate } from '@renderer/components/primitives/Plate'
import { initialsOf } from '@renderer/lib/initials'
import { formatIsoDate } from '@renderer/lib/format'
import { useEchoedText } from '@renderer/hooks/useEchoedText'
import { useArtistCredits } from '@renderer/hooks/useArtists'
import { SwatchPicker } from '@renderer/features/archive/components/stacks/SwatchPicker'
import { LinkEditor } from './LinkEditor'
import styles from '../ArtistsPage.module.scss'
import * as shell from '@renderer/lib/shell'

export interface ArtistSheetProps {
  artist: ArtistSummary
  busy: boolean
  onPatch: (patch: ArtistPatch) => void
  onSetPicture: (sourcePath: string | null) => void
  onRemove: () => void
  onClose: () => void
}

/** Which mode the sheet is in. Opens on `read`; `edit` is asked for. */
type Mode = 'read' | 'edit'

/**
 * One artist's record, opened as a sheet.
 *
 * Portalled, as every overlay a page draws must be: `ConsoleLayout` animates
 * the page with a transform, and a transform makes its element the containing
 * block for every `position: fixed` descendant — so a sheet rendered inside
 * the page would centre on the page box rather than the viewport. See
 * `Portal` for the full account.
 *
 * ## It opens as a record, not as a form
 *
 * It used to open as the editor: eight live controls, a colour picker and a
 * remove button, for a record somebody had clicked to *look at*. Opening a
 * roster entry is overwhelmingly a read — who is this, what are they on, how
 * do I reach them — and every one of those answers was a field label away
 * from being an edit.
 *
 * So the sheet reads, and **Edit** is a door. The read side can then be the
 * thing a dossier should be: the picture large, the credits named rather than
 * counted, the links pressable, the notes as prose. The edit side keeps the
 * write-immediately behaviour it always had — no save button and no unsaved
 * bar, because a roster entry is a small record edited in passing and a form
 * that must be committed is one the operator abandons half-finished. Text
 * fields debounce through `useEchoedText`, so a burst of typing is one write.
 *
 * ## Why the credits are a query and not a count
 *
 * `ArtistSummary` carries figures because the roster draws the whole register
 * at once. `0 projects · 1 release` is a question, though, and this is where
 * it gets answered — `useArtistCredits` names them, and is only read once a
 * sheet is open.
 */
export function ArtistSheet({
  artist,
  busy,
  onPatch,
  onSetPicture,
  onRemove,
  onClose
}: ArtistSheetProps): ReactNode {
  const [mode, setMode] = useState<Mode>('read')
  const [confirming, setConfirming] = useState(false)

  /*
   * Pressing the scrim closes, but a text selection dragged out of a field
   * and released on it must not — see `useBackdropDismiss`.
   */
  const dismiss = useBackdropDismiss(onClose)
  const credits = useArtistCredits(artist.id)

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

  const roles = artist.roles.map((role) => ARTIST_ROLE_LABEL[role])

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
          data-mode={mode}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          role="dialog"
          aria-label={artist.name}
          onClick={(event) => event.stopPropagation()}
        >
          {/*
            The masthead. The picture is drawn at plate size rather than as a
            thumbnail, because on this sheet it is the subject and not a mark
            beside a name — the same call the roster's tiles make.
          */}
          <header className={styles.sheetHead}>
            <Plate
              path={artist.picture.copiedPath}
              fallback={initialsOf(artist.name)}
              size={132}
              alt=""
              className={styles.sheetPlate}
            />

            <div className={styles.sheetTitle}>
              <span className={styles.sheetNameRow}>
                <span className={styles.sheetName}>{artist.name}</span>
                {/*
                  A mark, not a control. Whether this record is the operator is
                  a fact worth seeing while reading — the roster's tiles say it
                  too — and changing it is a thing you go into Edit to do.
                */}
                {artist.isOperator ? <span className={styles.sheetSelf}>THIS IS ME</span> : null}
              </span>
              {artist.realName ? <span className={styles.sheetReal}>{artist.realName}</span> : null}
              {roles.length > 0 ? (
                <span className={styles.sheetRoles}>{roles.join(' · ')}</span>
              ) : null}
              <span className={styles.sheetMeta}>
                {artist.projectCount} project{artist.projectCount === 1 ? '' : 's'} ·{' '}
                {artist.releaseCount} release{artist.releaseCount === 1 ? '' : 's'}
                {artist.favourite ? ' · ◆ Favourite' : ''}
              </span>
            </div>

            <div className={styles.sheetActions}>
              {mode === 'read' ? (
                <Button size="sm" variant="ghost" onClick={() => setMode('edit')}>
                  Edit
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setMode('read')}>
                  Done editing
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </header>

          {/*
            The claim — first thing in Edit, and only in Edit.

            One record on this roster is the operator, and the flag is what
            puts it at the front and lets a release mean you without naming
            you. It was a `YES` / `NO` chip in a field grid at the bottom of
            the editor, which is both the least prominent place on the sheet
            and the wrong grammar: this is not a property with two equal
            values, it is a claim somebody makes once.

            So it asks loudly where it can be answered, and nowhere else.
            Reading a record does not need a standing question about who the
            operator is — once the answer exists it is the marker beside the
            name, and a prompt repeated on every sheet is noise on all of them
            but one.
          */}
          {mode === 'edit' ? (
            artist.isOperator ? (
              <div className={styles.claim} data-set>
                <span className={styles.claimMark}>THIS IS ME</span>
                <span className={styles.claimText}>
                  This record is you. It leads the roster and stands in for you on every credit.
                </span>
                <Button size="sm" variant="ghost" onClick={() => onPatch({ isOperator: false })}>
                  Not me
                </Button>
              </div>
            ) : (
              <div className={styles.claim}>
                <span className={styles.claimAsk}>Is this you?</span>
                <span className={styles.claimText}>
                  One record on the roster is the operator. Marking it puts it first and lets a
                  credit mean you without naming you.
                </span>
                <Button variant="primary" onClick={() => onPatch({ isOperator: true })}>
                  This is me
                </Button>
              </div>
            )
          ) : null}

          {mode === 'read' ? (
            <ReadBody artist={artist} credits={credits.data ?? null} loading={credits.isLoading} />
          ) : (
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

              {/* The picture's own controls, where every other write is. */}
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Picture</span>
                <div className={styles.chips}>
                  <Button
                    size="sm"
                    variant="ghost"
                    busy={busy}
                    onClick={() => void choosePicture()}
                  >
                    {artist.picture.copiedPath ? 'Replace picture' : 'Add a picture'}
                  </Button>
                  {artist.picture.copiedPath ? (
                    <Button size="sm" variant="ghost" onClick={() => onSetPicture(null)}>
                      Clear
                    </Button>
                  ) : null}
                </div>
              </div>

              <FieldGrid columns={2}>
                <Field
                  label="Picture source"
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
                  label="On the roster since"
                  value={formatIsoDayFromEpoch(artist.createdAt)}
                />
              </FieldGrid>
            </div>
          )}

          {/*
            Removal, last and separated, and only while editing.
            It reaches beyond the record — it strips credits off every project
            and release naming them — so the confirmation says how many rather
            than asking "are you sure" about a number the operator cannot see.
          */}
          {mode === 'edit' ? (
            <footer className={styles.sheetFoot}>
              {confirming ? (
                <>
                  <span className={styles.confirmText}>
                    Remove {artist.name} from the roster? Their credits come off{' '}
                    {artist.projectCount} project{artist.projectCount === 1 ? '' : 's'} and{' '}
                    {artist.releaseCount} release{artist.releaseCount === 1 ? '' : 's'}. No files
                    are touched.
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
          ) : null}
        </motion.section>
      </motion.div>
    </Portal>
  )
}

/** The day a record was filed. Epoch millis, unlike a release's ISO day. */
function formatIsoDayFromEpoch(epoch: number): string {
  if (!epoch) return 'Unknown'
  const date = new Date(epoch)
  return formatIsoDate(
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`
  )
}

interface ReadBodyProps {
  artist: ArtistSummary
  credits: ArtistCredits | null
  loading: boolean
}

/**
 * The record, read.
 *
 * Ordered by what somebody opening an artist is actually asking, in order:
 * what are they on, how do I reach them, what did I write down about them.
 * The colour and the picture's provenance are settings rather than answers,
 * so they live behind Edit with the controls that change them.
 */
function ReadBody({ artist, credits, loading }: ReadBodyProps): ReactNode {
  const projects = credits?.projects ?? []
  const releases = credits?.releases ?? []

  return (
    <div className={styles.sheetBody}>
      <section className={styles.readBlock}>
        <span className={styles.fieldLabel}>Releases</span>
        {loading ? (
          <p className={styles.readEmpty}>Reading the catalogue…</p>
        ) : releases.length === 0 ? (
          <p className={styles.readEmpty}>Not credited on a release yet.</p>
        ) : (
          <ul className={styles.creditList}>
            {releases.map((credit) => (
              <li key={credit.releaseId} className={styles.credit}>
                <span className={styles.creditTitle}>
                  {credit.title}
                  {credit.subtitle ? (
                    <span className={styles.creditSub}>{credit.subtitle}</span>
                  ) : null}
                </span>
                <span className={styles.creditMeta}>
                  {RELEASE_KIND_LABEL[credit.kind]} · {RELEASE_STATUS_LABEL[credit.status]}
                  {credit.releaseDate ? ` · ${formatIsoDate(credit.releaseDate)}` : ''}
                </span>
                <span className={styles.creditAs} data-as={credit.as}>
                  {credit.as === 'primary'
                    ? 'Artist'
                    : credit.as === 'featured'
                      ? 'Featured'
                      : `${credit.tracks.length} track${credit.tracks.length === 1 ? '' : 's'}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.readBlock}>
        <span className={styles.fieldLabel}>Projects</span>
        {loading ? (
          <p className={styles.readEmpty}>Reading the register…</p>
        ) : projects.length === 0 ? (
          <p className={styles.readEmpty}>Not credited on a project in the archive yet.</p>
        ) : (
          <ul className={styles.creditList}>
            {projects.map((credit) => (
              <li key={credit.projectId} className={styles.credit}>
                <span className={styles.creditTitle}>{credit.title}</span>
                <span className={styles.creditMeta}>{PROJECT_CATEGORY_LABEL[credit.category]}</span>
                <span className={styles.creditAs}>{getStage(credit.stage).label}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.readBlock}>
        <span className={styles.fieldLabel}>Links</span>
        {artist.links.length === 0 ? (
          <p className={styles.readEmpty}>No addresses on file.</p>
        ) : (
          <ul className={styles.linkList}>
            {artist.links.map((link) => (
              <li key={link.id}>
                {/*
                  Opened in the operator's own browser rather than in a window
                  of this app: it is somebody's profile on somebody else's
                  service, and the console has no business rendering it.
                */}
                <button
                  type="button"
                  className={styles.linkRow}
                  onClick={() => shell.openExternal(link.url)}
                >
                  <span className={styles.linkPlatform}>
                    {link.label || SOCIAL_PLATFORM_LABEL[link.platform]}
                  </span>
                  <span className={styles.linkUrl}>{link.url}</span>
                  <span className={styles.linkGo} aria-hidden="true">
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.readBlock}>
        <span className={styles.fieldLabel}>Notes</span>
        {artist.notes.trim() ? (
          <p className={styles.readNotes}>{artist.notes}</p>
        ) : (
          <p className={styles.readEmpty}>Nothing noted.</p>
        )}
      </section>
    </div>
  )
}
