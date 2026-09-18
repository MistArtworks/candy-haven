import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { ArtistRecord } from '@shared/domain/artists'
import type {
  DiscographyRelease,
  ReleaseCredit,
  ReleaseKind,
  ReleasePatch,
  ReleaseStatus,
  TrackPatch
} from '@shared/domain/discography'
import {
  MAX_CATALOGUE_NUMBER,
  MAX_COPYRIGHT_LINE,
  MAX_LABEL_NAME,
  MAX_RELEASE_LINKS,
  MAX_RELEASE_SUBTITLE,
  MAX_RELEASE_TITLE,
  RELEASE_KINDS,
  RELEASE_KIND_LABEL,
  RELEASE_STATUSES,
  RELEASE_STATUS_LABEL,
  RELEASE_STATUS_PURPOSE,
  isValidUpc,
  maxTracksFor
} from '@shared/domain/discography.constants'
import type { ProjectSummary } from '@shared/domain/projects'
import { Portal } from '@renderer/components/primitives/Portal'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import { Plate } from '@renderer/components/primitives/Plate'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { useBackdropDismiss } from '@renderer/hooks/useBackdropDismiss'
import { useEchoedText } from '@renderer/hooks/useEchoedText'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import {
  sheetResizeTransition,
  sheetTabItemVariants,
  sheetTabVariants
} from '@renderer/motion/transitions'
import { LinkEditor } from '@renderer/features/artists/components/LinkEditor'
import { TrackList } from './TrackList'
import { CreditPicker } from './CreditPicker'
import { CreditRows } from './CreditRows'
import styles from '../DiscographyPage.module.scss'

/**
 * The five sections, ordered by when the operator learns each thing.
 *
 * What it is, then who made it, then what is on it, then the distribution
 * metadata a label sends weeks later, then the artefacts. That order is the
 * rule the flat sheet already stated in its comments and could not honour with
 * everything at one altitude — twelve fields, a credit picker, a tracklist,
 * six identifiers and two asset wells in a single scroll.
 *
 * Five rather than three because CREDITS and ARTWORK each earned one. The
 * credits list grows a row per role and would otherwise push the status chips
 * off screen; the cover is the one thing on a release worth drawing large, and
 * the flat sheet gave it a 120px well two thirds of the way down.
 */
const TABS = ['release', 'credits', 'tracks', 'trade', 'artwork'] as const
type SheetTab = (typeof TABS)[number]

const TAB_LABEL: Record<SheetTab, string> = {
  release: 'RELEASE',
  credits: 'CREDITS',
  tracks: 'TRACKS',
  trade: 'TRADE',
  artwork: 'ARTWORK'
}

export interface ReleaseSheetProps {
  release: DiscographyRelease
  roster: readonly ArtistRecord[]
  /** The whole register, for resolving links a track already holds. */
  projects: readonly ProjectSummary[]
  /** Finished work not already on this release — what the pickers may offer. */
  linkable: readonly ProjectSummary[]
  labels: readonly string[]
  busy: boolean
  error: string | null
  onPatch: (patch: ReleasePatch) => void
  onSetAsset: (asset: 'artwork' | 'canvas', sourcePath: string | null) => void
  /** Opens the add-a-track dialog, which the page owns. */
  onAddTrack: () => void
  onPatchTrack: (trackId: string, patch: TrackPatch) => void
  onRemoveTrack: (trackId: string) => void
  onReorderTracks: (trackIds: string[]) => void
  /** Names the file that shipped as a track, or clears it with null. */
  onSetTrackMaster: (trackId: string, path: string | null) => void
  onRemove: () => void
  onClose: () => void
}

/**
 * One release, opened as a sheet.
 *
 * Portalled, like every overlay a page draws — see `Portal`.
 *
 * Everything writes immediately, as the artist sheet does and for the same
 * reason: a catalogue entry is filled in over weeks, a field at a time, as
 * the information arrives from a label. A form that had to be committed
 * would be one abandoned half-filled.
 *
 * ## Five tabs
 *
 * It was one scroll — see `TABS` for what that cost. The strip mirrors
 * `ProjectDossier`'s, deliberately: this and the dossier are the console's two
 * record surfaces, and a release should not be navigated differently from a
 * project.
 *
 * The masthead keeps the artwork, the title and the figures on every tab, so
 * the sheet always says which record is open even mid-edit. ARTWORK draws the
 * cover large; this is the thumbnail that says where you are.
 */
export function ReleaseSheet({
  release,
  roster,
  projects,
  linkable,
  labels,
  busy,
  error,
  onPatch,
  onSetAsset,
  onAddTrack,
  onPatchTrack,
  onRemoveTrack,
  onReorderTracks,
  onSetTrackMaster,
  onRemove,
  onClose
}: ReleaseSheetProps): ReactNode {
  const [confirming, setConfirming] = useState(false)
  const [tab, setTab] = useState<SheetTab>('release')
  const animate = useAnimationsEnabled()
  /*
   * Pressing the scrim closes, but a text selection dragged out of a field
   * and released on it must not — see `useBackdropDismiss` for why the
   * obvious `onClick` cannot tell those apart.
   */
  const dismiss = useBackdropDismiss(onClose)

  const [title, setTitle] = useEchoedText(release.title, (value) => {
    if (value.trim()) onPatch({ title: value })
  })
  const [subtitle, setSubtitle] = useEchoedText(release.subtitle, (v) => onPatch({ subtitle: v }))
  const [label, setLabel] = useEchoedText(release.label, (v) => onPatch({ label: v }))
  const [catalogue, setCatalogue] = useEchoedText(release.catalogueNumber, (v) =>
    onPatch({ catalogueNumber: v })
  )
  const [upc, setUpc] = useEchoedText(release.upc, (v) => onPatch({ upc: v }))
  const [phonographic, setPhonographic] = useEchoedText(release.phonographicLine, (v) =>
    onPatch({ phonographicLine: v })
  )
  const [copyright, setCopyright] = useEchoedText(release.copyrightLine, (v) =>
    onPatch({ copyrightLine: v })
  )
  const [notes, setNotes] = useEchoedText(release.notes, (v) => onPatch({ notes: v }))

  const chooseAsset = async (asset: 'artwork' | 'canvas'): Promise<void> => {
    const path = await window.candy.shell.selectFile({
      title: asset === 'artwork' ? 'Choose cover art' : 'Choose a canvas',
      filters:
        asset === 'artwork'
          ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif'] }]
          : [{ name: 'Video', extensions: ['mp4', 'mov', 'webm', 'gif'] }]
    })
    if (path) onSetAsset(asset, path)
  }

  const mastered = release.tracks.filter((track) => track.master !== null).length

  return (
    <Portal>
      <motion.div
        className={styles.sheetBackdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        {...dismiss}
      >
        {/*
          `layout` is what animates the height when a tab is swapped, and the
          three fixed rows carry `layout="position"` rather than plain
          `layout` on purpose: motion resizes a layout element by scaling it,
          so a masthead without the positional variant is squashed vertically
          for the length of the animation. Position-only means they travel and
          never distort.

          Both are dropped entirely when animation is off — a `layout` prop
          still animates under `prefers-reduced-motion`, so gating has to
          remove it rather than shorten it.
        */}
        <motion.section
          className={styles.sheet}
          layout={animate ? true : undefined}
          transition={animate ? sheetResizeTransition : { duration: 0 }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          role="dialog"
          aria-label={release.title}
          onClick={(event) => event.stopPropagation()}
        >
          <motion.header layout={animate ? 'position' : undefined} className={styles.sheetHead}>
            <Plate
              path={release.artwork.copiedPath}
              fallback={RELEASE_KIND_LABEL[release.kind].slice(0, 2)}
              size={96}
              alt=""
            />

            <div className={styles.sheetTitle}>
              <span className={styles.sheetName}>{release.title}</span>
              <span className={styles.sheetMeta}>
                {RELEASE_KIND_LABEL[release.kind]} · {RELEASE_STATUS_LABEL[release.status]}
                {release.releaseDate ? ` · ${release.releaseDate}` : ''} · {release.tracks.length}{' '}
                track{release.tracks.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className={styles.sheetActions}>
              <Button size="sm" variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </motion.header>

          {error ? (
            <p className={styles.sheetError} role="alert">
              {error}
            </p>
          ) : null}

          {/*
            The tab strip, as a horizontal row rather than a column. Same shape
            as the dossier's, badges included.
          */}
          <motion.nav
            layout={animate ? 'position' : undefined}
            className={styles.sheetTabs}
            aria-label="Release sections"
          >
            {TABS.map((entry) => (
              <button
                key={entry}
                type="button"
                className={styles.sheetTab}
                data-selected={tab === entry || undefined}
                aria-current={tab === entry}
                onClick={() => setTab(entry)}
              >
                {TAB_LABEL[entry]}

                {/*
                  Counts where a tab holds a list, so its weight is legible
                  without opening it.

                  TRACKS reports masters over tracks, which is the one
                  outstanding thing on an otherwise finished entry that nothing
                  else says out loud — a release can be out in the world with
                  three of its four source files unnamed, and that only shows
                  up when somebody goes looking for the audio.
                */}
                {entry === 'tracks' && release.tracks.length > 0 ? (
                  <span
                    className={styles.sheetTabBadge}
                    data-complete={mastered === release.tracks.length || undefined}
                  >
                    {mastered}/{release.tracks.length}
                  </span>
                ) : null}

                {entry === 'credits' && release.credits.length > 0 ? (
                  <span className={styles.sheetTabBadge}>{release.credits.length}</span>
                ) : null}
              </button>
            ))}
          </motion.nav>

          {/*
            Keyed by tab, so React swaps the subtree in one commit and the
            stagger replays. Deliberately **not** inside `AnimatePresence`:
            with an exit animation the outgoing tab has to finish before the
            incoming one mounts, which empties the body and collapses the sheet
            to a bare strip between every press. Replacing outright and
            animating only the arrival is what keeps the height monotonic.
          */}
          <motion.div
            key={tab}
            className={styles.sheetBody}
            variants={animate ? sheetTabVariants : undefined}
            initial={animate ? 'initial' : false}
            animate={animate ? 'animate' : undefined}
          >
            {/* ------------------------------------------------ what it is */}

            {tab === 'release' ? (
              <>
                <motion.div
                  className={styles.sheetFields}
                  variants={animate ? sheetTabItemVariants : undefined}
                >
                  <TextInput
                    label="Title"
                    value={title}
                    onChange={setTitle}
                    maxLength={MAX_RELEASE_TITLE}
                  />
                  <TextInput
                    label="Subtitle"
                    value={subtitle}
                    onChange={setSubtitle}
                    maxLength={MAX_RELEASE_SUBTITLE}
                    placeholder="Nasko Remix · Deluxe Edition"
                  />
                </motion.div>

                <motion.div
                  className={styles.field}
                  variants={animate ? sheetTabItemVariants : undefined}
                >
                  <span className={styles.fieldLabel}>Kind</span>
                  <div className={styles.chips}>
                    {RELEASE_KINDS.map((kind: ReleaseKind) => (
                      <button
                        key={kind}
                        type="button"
                        className={styles.chip}
                        data-on={release.kind === kind || undefined}
                        aria-pressed={release.kind === kind}
                        onClick={() => onPatch({ kind })}
                      >
                        {RELEASE_KIND_LABEL[kind]}
                      </button>
                    ))}
                  </div>
                </motion.div>

                <motion.div
                  className={styles.field}
                  variants={animate ? sheetTabItemVariants : undefined}
                >
                  <span className={styles.fieldLabel}>Status</span>
                  <div className={styles.chips}>
                    {RELEASE_STATUSES.map((status: ReleaseStatus) => (
                      <button
                        key={status}
                        type="button"
                        className={styles.chip}
                        data-on={release.status === status || undefined}
                        aria-pressed={release.status === status}
                        title={RELEASE_STATUS_PURPOSE[status]}
                        onClick={() => onPatch({ status })}
                      >
                        {RELEASE_STATUS_LABEL[status]}
                      </button>
                    ))}
                  </div>
                  <input
                    type="date"
                    className={styles.date}
                    value={release.releaseDate ?? ''}
                    aria-label="Release date"
                    onChange={(event) => onPatch({ releaseDate: event.target.value || null })}
                  />
                  {/*
                    The service refuses RELEASED without a date, so the field
                    says so before it is pressed rather than after.
                  */}
                  {release.status === 'released' && !release.releaseDate ? (
                    <p className={styles.warn}>A released entry needs the date it came out.</p>
                  ) : null}

                  {/*
                    What flipping this does to the ARCHIVE, said before it is
                    pressed.

                    RELEASED moves every project behind a track to the RELEASED
                    stage, which is a write into another department — the kind
                    of consequence that should never be a surprise, however
                    much it is the interlink the operator asked for.
                  */}
                  {release.tracks.some((track) => track.projectId !== null) ? (
                    <p className={styles.hint}>
                      {release.status === 'released'
                        ? 'The linked projects are at RELEASED in the ARCHIVE. Moving this back returns them to TRACK READY.'
                        : 'Marking this RELEASED will move every linked project to the RELEASED stage in the ARCHIVE.'}
                    </p>
                  ) : null}
                </motion.div>

                <motion.div
                  className={styles.field}
                  variants={animate ? sheetTabItemVariants : undefined}
                >
                  <span className={styles.fieldLabel}>Notes</span>
                  <textarea
                    className={styles.notes}
                    value={notes}
                    rows={4}
                    placeholder="Who mastered it, what the deal was, what to remember next time."
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </motion.div>
              </>
            ) : null}

            {/* ---------------------------------------------- who is on it */}

            {tab === 'credits' ? (
              <>
                {/*
                  Billing first, then the liner notes.

                  Two different questions that look alike: who the release is
                  *by*, which decides how it is titled, and who *did the work*,
                  which is what a sleeve prints. Somebody can be in both, and
                  usually is — the main artist of a single generally produced
                  and wrote it too.
                */}
                <motion.div variants={animate ? sheetTabItemVariants : undefined}>
                  <CreditPicker
                    roster={roster}
                    billed={release.artistIds}
                    featured={release.featuredArtistIds}
                    onBilled={(artistIds) => onPatch({ artistIds })}
                    onFeatured={(featuredArtistIds) => onPatch({ featuredArtistIds })}
                  />
                </motion.div>

                <motion.div
                  className={styles.field}
                  variants={animate ? sheetTabItemVariants : undefined}
                >
                  <span className={styles.fieldLabel}>Credits</span>
                  <CreditRows
                    credits={release.credits}
                    roster={roster}
                    busy={busy}
                    onChange={(credits: ReleaseCredit[]) => onPatch({ credits })}
                  />
                </motion.div>
              </>
            ) : null}

            {/* ------------------------------------------------ the tracks */}

            {tab === 'tracks' ? (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Running order</span>
                <TrackList
                  tracks={release.tracks}
                  maxTracks={maxTracksFor(release.kind)}
                  projects={projects}
                  linkable={linkable}
                  roster={roster}
                  busy={busy}
                  onAdd={onAddTrack}
                  onPatch={onPatchTrack}
                  onRemove={onRemoveTrack}
                  onReorder={onReorderTracks}
                  onSetMaster={onSetTrackMaster}
                />
              </div>
            ) : null}

            {/* ----------------------------------- where it went, and on what */}

            {tab === 'trade' ? (
              <>
                <motion.div
                  className={styles.sheetFields}
                  variants={animate ? sheetTabItemVariants : undefined}
                >
                  <TextInput
                    label="Label"
                    value={label}
                    onChange={setLabel}
                    maxLength={MAX_LABEL_NAME}
                    placeholder="Empty means self-released"
                    // Autocompletes from labels already used, which is what
                    // keeps the strings consistent without an id behind them
                    // (D4).
                    aside={
                      labels.length > 0 ? (
                        <select
                          className={styles.inlineSelect}
                          value=""
                          aria-label="Labels already used"
                          onChange={(event) => {
                            if (event.target.value) setLabel(event.target.value)
                          }}
                        >
                          <option value="">Used before…</option>
                          {labels.map((entry) => (
                            <option key={entry} value={entry}>
                              {entry}
                            </option>
                          ))}
                        </select>
                      ) : undefined
                    }
                  />
                  <TextInput
                    label="Catalogue number"
                    value={catalogue}
                    onChange={setCatalogue}
                    maxLength={MAX_CATALOGUE_NUMBER}
                    mono
                  />
                </motion.div>

                <motion.div
                  className={styles.sheetFields}
                  variants={animate ? sheetTabItemVariants : undefined}
                >
                  <TextInput
                    label="UPC"
                    value={upc}
                    onChange={setUpc}
                    mono
                    hint={
                      upc && !isValidUpc(upc)
                        ? 'A UPC is twelve to fourteen digits.'
                        : 'Identifies the product. An ISRC identifies a recording and lives on the track.'
                    }
                  />
                  <TextInput
                    label="℗ Phonographic"
                    value={phonographic}
                    onChange={setPhonographic}
                    maxLength={MAX_COPYRIGHT_LINE}
                    placeholder="2026 Candy Heist"
                  />
                </motion.div>

                <motion.div variants={animate ? sheetTabItemVariants : undefined}>
                  <TextInput
                    label="© Copyright"
                    value={copyright}
                    onChange={setCopyright}
                    maxLength={MAX_COPYRIGHT_LINE}
                    placeholder="2026 Candy Heist"
                  />
                </motion.div>

                <motion.div
                  className={styles.field}
                  variants={animate ? sheetTabItemVariants : undefined}
                >
                  <span className={styles.fieldLabel}>Where it is</span>
                  <LinkEditor
                    links={release.links}
                    max={MAX_RELEASE_LINKS}
                    onChange={(links) => onPatch({ links })}
                  />
                </motion.div>
              </>
            ) : null}

            {/* --------------------------------------------- the artefacts */}

            {tab === 'artwork' ? (
              <>
                <motion.div
                  className={styles.assets}
                  variants={animate ? sheetTabItemVariants : undefined}
                >
                  <div className={styles.asset}>
                    {/*
                      Drawn large here, where there is room for it. The sheet
                      used to give the cover a 120px well between the links and
                      the paperwork, which is a thumbnail of the one thing on a
                      release anybody recognises it by.
                    */}
                    <Plate
                      path={release.artwork.copiedPath}
                      fallback="COVER"
                      size={320}
                      alt="Cover art"
                    />
                    <div className={styles.assetActions}>
                      <Button size="sm" variant="ghost" onClick={() => void chooseAsset('artwork')}>
                        {release.artwork.copiedPath ? 'Replace cover' : 'Add cover'}
                      </Button>
                      {release.artwork.copiedPath ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onSetAsset('artwork', null)}
                        >
                          Clear
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className={styles.asset}>
                    {/*
                      The canvas is a looping video, so it is reported rather
                      than drawn — a still frame of a 9:16 loop tells you less
                      than its filename does, and decoding video for a
                      thumbnail is work this department has no reason to do.
                    */}
                    <div className={styles.canvasPlate}>
                      <span className={styles.canvasMark}>CANVAS</span>
                      <span className={styles.canvasState}>
                        {release.canvas.copiedPath ? 'Attached' : 'None'}
                      </span>
                    </div>
                    <div className={styles.assetActions}>
                      <Button size="sm" variant="ghost" onClick={() => void chooseAsset('canvas')}>
                        {release.canvas.copiedPath ? 'Replace canvas' : 'Add canvas'}
                      </Button>
                      {release.canvas.copiedPath ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onSetAsset('canvas', null)}
                        >
                          Clear
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </motion.div>

                {/*
                  Where each copy came from. Both are *copies* — the archive
                  takes its own, under `Media\releases\`, because a path into
                  somebody's Downloads folder is a cover that disappears the
                  first time they tidy up. This says what was copied, long
                  after that folder has been emptied.
                */}
                <motion.div variants={animate ? sheetTabItemVariants : undefined}>
                  <FieldGrid columns={2}>
                    <Field
                      label="Cover source"
                      value={release.artwork.sourcePath ?? 'None'}
                      mono
                      selectable
                    />
                    <Field
                      label="Canvas source"
                      value={release.canvas.sourcePath ?? 'None'}
                      mono
                      selectable
                    />
                  </FieldGrid>
                </motion.div>
              </>
            ) : null}
          </motion.div>

          <motion.footer layout={animate ? 'position' : undefined} className={styles.sheetFoot}>
            {confirming ? (
              <>
                <span className={styles.confirmText}>
                  Remove “{release.title}” from the catalogue? Its {release.tracks.length} track
                  {release.tracks.length === 1 ? '' : 's'} and its cover copy go with it. No project
                  is touched — the ARCHIVE keeps every one of them, and any at RELEASED because of
                  this entry go back to TRACK READY.
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
                Remove from catalogue
              </Button>
            )}
          </motion.footer>
        </motion.section>
      </motion.div>
    </Portal>
  )
}
