import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { ArtistRecord } from '@shared/domain/artists'
import type {
  DiscographyRelease,
  DiscographySummary,
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
  MAX_RELEASE_SUBTITLE,
  MAX_RELEASE_TITLE,
  RELEASE_KINDS,
  RELEASE_KIND_LABEL,
  RELEASE_STATUSES,
  RELEASE_STATUS_LABEL,
  RELEASE_STATUS_PURPOSE,
  isValidUpc,
  maxTracksFor,
  withoutStream
} from '@shared/domain/discography.constants'
import type { ProjectSummary } from '@shared/domain/projects'
import { Portal } from '@renderer/components/primitives/Portal'
import { Button } from '@renderer/components/primitives/Button'
import { DateInput, TextArea, TextInput } from '@renderer/components/primitives/Input'
import { Plate } from '@renderer/components/primitives/Plate'
import { useBackdropDismiss } from '@renderer/hooks/useBackdropDismiss'
import { useEchoedText } from '@renderer/hooks/useEchoedText'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import {
  sheetResizeTransition,
  sheetTabItemVariants,
  sheetTabVariants
} from '@renderer/motion/transitions'
import { DistributionEditor } from './DistributionEditor'
import { ReleaseDetails } from './ReleaseDetails'
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

/**
 * How tall both artefact wells are drawn, in pixels.
 *
 * Declared here and matched by `.canvasPlate` in the stylesheet, because the
 * cover's height comes from a `Plate` prop and the canvas's from CSS. Two
 * numbers that must agree; if this moves, that moves.
 */
const ARTEFACT_HEIGHT = 200

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
  onPatch: (patch: ReleasePatch) => void
  /** Takes over an automatically raised entry, unlocking the sheet. */
  onAdopt: () => void
  /** Writes the distributor folder into `RELEASES`. */
  onPublish: () => void
  publishing: boolean
  onSetAsset: (asset: 'artwork' | 'canvas', sourcePath: string | null) => void
  /** Opens the add-a-track dialog, which the page owns. */
  /**
   * The rest of the catalogue, for the running order's two release-aware
   * pieces: the picker that adds an existing record as a row, and the
   * `ALSO ON` line naming the records that collect this one.
   */
  releases: readonly DiscographySummary[]
  onAddTrack: () => void
  /** Adds an existing release to the running order. See `TrackList`. */
  onCollectTrack: (releaseId: string) => void
  /** Open another record — passed down so a collected row can be followed. */
  onOpenRelease?: (releaseId: string) => void
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
  onPatch,
  onAdopt,
  onPublish,
  publishing,
  onSetAsset,
  releases,
  onAddTrack,
  onCollectTrack,
  onOpenRelease,
  onPatchTrack,
  onRemoveTrack,
  onReorderTracks,
  onSetTrackMaster,
  onRemove,
  onClose
}: ReleaseSheetProps): ReactNode {
  const [confirming, setConfirming] = useState(false)
  const [tab, setTab] = useState<SheetTab>('release')

  /*
   * The titles of the records that collect this one.
   *
   * `appearsOn` carries ids; the catalogue this sheet was handed carries the
   * titles behind them. Resolved rather than shipped resolved, for the reason
   * the registry ships ids for everything else: one list, read by whoever
   * needs a name out of it.
   */
  const collectedOn = (releases.find((entry) => entry.id === release.id)?.appearsOn ?? [])
    .map((id) => releases.find((entry) => entry.id === id)?.title)
    .filter((title): title is string => Boolean(title))
  /*
   * The sheet opens as a record, not as a form.
   *
   * Nothing here is staged — every field commits as it is changed, which is
   * what the rest of this console does and what makes a catalogue quick to
   * keep. The cost of that is an open form over finished work: anything the
   * operator brushes past while reading is a write to a record that was
   * already right. So reading and writing are separate acts, and the second
   * one has to be asked for.
   *
   * `false` on every open, and the sheet is keyed by release id at its call
   * site, so opening the next record cannot inherit the last one's mode.
   */
  const [editing, setEditing] = useState(false)
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
  const unlinked = withoutStream(release.distribution)

  /*
   * Read-only until adopted.
   *
   * `raisedFor` is set only on an entry the app raised by itself, when a
   * project named its final master, and only while nobody has touched it.
   * Until it is adopted the entry is a *projection* of the project: the app
   * made it, and the app withdraws it again if that master is cleared.
   * Offering a form over a record that may vanish underneath the operator
   * is the wrong offer, so the sheet reads rather than writes.
   *
   * A disabled `fieldset` does the work, not a prop threaded through five
   * tabs of controls. Every input, select, textarea and button in the body
   * is a native form element, and `fieldset[disabled]` takes all of them
   * out of reach including by keyboard — which a `pointer-events: none`
   * overlay would not, and which twenty `disabled` props would eventually
   * miss one of.
   *
   * The tab strip, CLOSE and REMOVE FROM CATALOGUE all sit outside the
   * body, so a locked entry can still be read in full, closed, and thrown
   * away. Reading and discarding are not editing.
   */
  const locked = release.raisedFor !== null

  /*
   * The two reasons the body does not take input, folded into the one flag
   * the fieldset reads.
   *
   * They are different refusals and both are worth keeping. `locked` is the
   * app saying *this record is not yours yet*, and the way past it is ADOPT.
   * `!editing` is the operator not having asked to change anything, and the
   * way past it is EDIT. An unadopted entry is therefore read-only twice
   * over, and adopting it drops straight into editing — which is what its
   * own bar promises.
   */
  const readOnly = locked || !editing

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
              {/*
                The way in, and the way back out again.

                Not offered while the entry is unadopted: there the ADOPT bar
                is the only honest way in, and a second button claiming to
                unlock the same form would be a dead end.

                DONE rather than SAVE, deliberately. There is nothing to
                save — every field has already written — and a button
                labelled SAVE would promise a commit that had happened
                several keystrokes ago.
              */}
              {locked ? null : (
                <Button
                  size="sm"
                  variant={editing ? 'primary' : 'ghost'}
                  onClick={() => setEditing((on) => !on)}
                  title={
                    editing ? 'Stop editing — everything is already saved' : 'Edit this release'
                  }
                >
                  {editing ? 'Done' : 'Edit'}
                </Button>
              )}

              <Button size="sm" variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </motion.header>

          {/*
            The entry is a projection until it is adopted — see `locked`. The
            bar sits outside the fieldset below, so the one control that can
            unlock the record is the one control the lock does not reach.
          */}
          {locked ? (
            <div className={styles.adoptBar}>
              <span className={styles.adoptText}>
                Raised automatically when this project named its final master. Clearing that master
                withdraws this entry again — adopt it to make it yours and start editing.
              </span>
              <Button
                size="sm"
                variant="primary"
                busy={busy}
                onClick={() => {
                  // Straight into editing, because that is what the bar beside
                  // this button says adopting is for.
                  setEditing(true)
                  onAdopt()
                }}
              >
                Adopt this release
              </Button>
            </div>
          ) : null}

          {/*
            Two renderings of one release, and the split is the whole of D25.

            Reading gets `ReleaseDetails`, which holds no mutation props at
            all — the read view *cannot* write rather than declining to,
            which is what D24 got wrong by disabling this form instead.

            The tab strip lives in the editing branch only. Tabs navigate a
            form; a record is read top to bottom, and a live strip above a
            page that ignored it would be a control that does nothing.
          */}
          {readOnly ? (
            <motion.div
              className={styles.sheetBody}
              variants={animate ? sheetTabVariants : undefined}
              initial={animate ? 'initial' : false}
              animate={animate ? 'animate' : undefined}
            >
              <ReleaseDetails
                release={release}
                roster={roster}
                projects={projects}
                releases={releases}
                onOpenRelease={onOpenRelease}
              />
            </motion.div>
          ) : (
            <>
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

                    {/*
                      How many platforms have somewhere to point, once the
                      record is out.

                      Only then: before release an empty stream slot is the
                      normal state, and a badge counting it would be a warning
                      about nothing. Shown on the strip rather than only
                      inside TRADE for the same reason TRACKS carries its
                      master count — the gap is worth seeing from whichever
                      tab you happen to be on.
                    */}
                    {entry === 'trade' && release.status === 'released' && unlinked > 0 ? (
                      <span className={styles.sheetTabBadge}>
                        {release.distribution.length - unlinked}/{release.distribution.length}
                      </span>
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
                {/*
                  A fieldset, so one attribute locks every control in the body.
                  `display: contents` is deliberately not used — the element is the
                  flex column the body used to be, so the stagger and the gaps are
                  unchanged. See `locked`.
                */}
                <fieldset className={styles.sheetForm} disabled={readOnly}>
                  {/* ------------------------------------------------ what it is */}

                  {tab === 'release' ? (
                    <>
                      {/*
                        One column with the labels in a gutter.

                        It was a two-column grid pairing fields by meaning, and the pairing
                        was the problem: a chip row and a text field in the same row have
                        different heights, so nothing lined up and the eye had no spine to
                        run down. With the labels in a fixed column every value starts at
                        the same x by construction — which is what the read view's
                        `FieldGrid columns={1}` already does, and what a register looks
                        like.
                      */}
                      <motion.div
                        className={styles.gutterForm}
                        variants={animate ? sheetTabItemVariants : undefined}
                      >
                        {/* A release has one name, and it leads. */}
                        <TextInput
                          label="Title"
                          value={title}
                          onChange={setTitle}
                          maxLength={MAX_RELEASE_TITLE}
                          size="lg"
                          layout="gutter"
                        />

                        <TextInput
                          label="Subtitle"
                          value={subtitle}
                          onChange={setSubtitle}
                          maxLength={MAX_RELEASE_SUBTITLE}
                          placeholder="Nasko Remix · Deluxe Edition"
                          layout="gutter"
                        />

                        {/*
                          The chip rows are not primitives, so they get the gutter from the
                          page rather than from `ControlShell` — same two columns, same
                          measure, so they sit on the one spine as everything else.
                        */}
                        <div className={styles.gutterRow}>
                          <span className={styles.gutterLabel}>Kind</span>
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
                        </div>

                        <div className={styles.gutterRow}>
                          <span className={styles.gutterLabel}>Status</span>
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
                        </div>

                        {/*
                          The primitive, not a third raw `input type=date`. The refusal rides
                          on the field as its hint rather than standing underneath as a loose
                          paragraph, so the thing that is wrong and the thing that says so
                          are the same object.
                        */}
                        <DateInput
                          label="Release date"
                          value={release.releaseDate ?? ''}
                          onChange={(value) => onPatch({ releaseDate: value || null })}
                          invalid={release.status === 'released' && !release.releaseDate}
                          layout="gutter"
                          hint={
                            release.status === 'released' && !release.releaseDate
                              ? 'A released entry needs the date it came out.'
                              : undefined
                          }
                        />

                        {/*
                          What flipping the status does to the ARCHIVE, said before it is
                          pressed. RELEASED moves every project behind a track to the
                          RELEASED stage — a write into another department, and never
                          something to discover after the fact. In the value column, under
                          the two controls it is about, and quiet: a consequence to be aware
                          of rather than a warning.
                        */}
                        {release.tracks.some((track) => track.projectId !== null) ? (
                          <p className={styles.gutterNote}>
                            {release.status === 'released'
                              ? 'Linked projects sit at RELEASED in the ARCHIVE. Moving this back returns them to TRACK READY.'
                              : 'Marking this RELEASED moves every linked project to RELEASED in the ARCHIVE.'}
                          </p>
                        ) : null}

                        <TextArea
                          label="Notes"
                          value={notes}
                          onChange={setNotes}
                          rows={3}
                          placeholder="Who mastered it, what the deal was, what to remember next time."
                          layout="gutter"
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
                      <motion.div
                        className={styles.gutterForm}
                        variants={animate ? sheetTabItemVariants : undefined}
                      >
                        <CreditPicker
                          roster={roster}
                          billed={release.artistIds}
                          featured={release.featuredArtistIds}
                          onBilled={(artistIds) => onPatch({ artistIds })}
                          onFeatured={(featuredArtistIds) => onPatch({ featuredArtistIds })}
                        />

                        <div className={styles.gutterRow}>
                          <span className={styles.gutterLabel}>Credits</span>
                          <CreditRows
                            credits={release.credits}
                            roster={roster}
                            busy={busy}
                            onChange={(credits: ReleaseCredit[]) => onPatch({ credits })}
                          />
                        </div>
                      </motion.div>
                    </>
                  ) : null}

                  {/* ------------------------------------------------ the tracks */}

                  {/*
                    The reverse of the membership a row can hold: the records
                    that collect *this* one.

                    Read from `appearsOn`, which the register derives on every
                    read from the rows pointing here — a single stores nothing
                    about the albums it ends up on, and does not need to. Drawn
                    only when there is something to say, which for most of a
                    catalogue is never.
                  */}
                  {tab === 'tracks' && collectedOn.length > 0 ? (
                    <div className={styles.gutterRow}>
                      <span className={styles.gutterLabel}>Also on</span>
                      <p className={styles.alsoOn}>{collectedOn.join(' · ')}</p>
                    </div>
                  ) : null}

                  {tab === 'tracks' ? (
                    <div className={styles.gutterRow}>
                      <span className={styles.gutterLabel}>Running order</span>
                      <TrackList
                        tracks={release.tracks}
                        maxTracks={maxTracksFor(release.kind)}
                        projects={projects}
                        linkable={linkable}
                        roster={roster}
                        releases={releases}
                        releaseId={release.id}
                        busy={busy}
                        onAdd={onAddTrack}
                        onCollect={onCollectTrack}
                        onOpenRelease={onOpenRelease}
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
                        className={styles.gutterForm}
                        variants={animate ? sheetTabItemVariants : undefined}
                      >
                        <TextInput
                          label="Label"
                          value={label}
                          onChange={setLabel}
                          maxLength={MAX_LABEL_NAME}
                          layout="gutter"
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
                          layout="gutter"
                        />

                        <TextInput
                          label="UPC"
                          value={upc}
                          onChange={setUpc}
                          mono
                          layout="gutter"
                          invalid={Boolean(upc) && !isValidUpc(upc)}
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
                          layout="gutter"
                        />

                        <TextInput
                          label="© Copyright"
                          value={copyright}
                          onChange={setCopyright}
                          maxLength={MAX_COPYRIGHT_LINE}
                          placeholder="2026 Candy Heist"
                          layout="gutter"
                        />

                        <div className={styles.gutterRow}>
                          <span className={styles.gutterLabel}>Distribution</span>
                          <DistributionEditor
                            entries={release.distribution}
                            out={release.status === 'released'}
                            onChange={(distribution) => onPatch({ distribution })}
                          />
                        </div>
                      </motion.div>
                    </>
                  ) : null}

                  {/* --------------------------------------------- the artefacts */}

                  {tab === 'artwork' ? (
                    <>
                      <motion.div
                        className={styles.gutterForm}
                        variants={animate ? sheetTabItemVariants : undefined}
                      >
                        {/*
                          Both artefacts in one row, at one height.

                          They are two faces of the same record — the square a
                          store shows and the vertical loop a phone plays — so
                          they are worth reading side by side. Equal height and
                          unequal width is what those two formats *are*;
                          matching their widths instead would mean cropping one
                          of them into a shape it is not.
                        */}
                        <div className={styles.gutterRow}>
                          <span className={styles.gutterLabel}>Artefacts</span>
                          <div className={styles.assets}>
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
                                size={ARTEFACT_HEIGHT}
                                alt="Cover art"
                              />
                              <div className={styles.assetActions}>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => void chooseAsset('artwork')}
                                >
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
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => void chooseAsset('canvas')}
                                >
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
                          </div>
                        </div>

                        {/*
                          Where each copy came from. Both are *copies* — the
                          archive takes its own under `Media\releases\`, because a
                          path into somebody's Downloads folder is a cover that
                          disappears the first time they tidy up. This says what
                          was copied, long after that folder has been emptied.
                        */}
                        <div className={styles.gutterRow}>
                          <span className={styles.gutterLabel}>Cover source</span>
                          <span className={styles.gutterValue} data-selectable>
                            {release.artwork.sourcePath ?? 'None'}
                          </span>
                        </div>

                        <div className={styles.gutterRow}>
                          <span className={styles.gutterLabel}>Canvas source</span>
                          <span className={styles.gutterValue} data-selectable>
                            {release.canvas.sourcePath ?? 'None'}
                          </span>
                        </div>
                      </motion.div>
                    </>
                  ) : null}
                </fieldset>
              </motion.div>
            </>
          )}

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
              <>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
                  Remove from catalogue
                </Button>

                <span className={styles.footSpacer} />

                {/*
                  Offered even when the record is incomplete, and refused by
                  the service with the list of what is missing. A disabled
                  button here would have to re-derive those four conditions
                  in the renderer, and would then be a second opinion about
                  them that could disagree with the first.
                */}
                <Button
                  size="md"
                  variant="primary"
                  busy={publishing}
                  disabled={locked}
                  title={
                    locked
                      ? 'Adopt this release first'
                      : 'Write the folder into Candy Haven\\RELEASES'
                  }
                  onClick={onPublish}
                >
                  Ready to publish
                </Button>
              </>
            )}
          </motion.footer>
        </motion.section>
      </motion.div>
    </Portal>
  )
}
