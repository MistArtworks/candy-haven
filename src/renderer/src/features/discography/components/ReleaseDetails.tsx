import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { ArtistRecord } from '@shared/domain/artists'
import type {
  DiscographyRelease,
  DiscographySummary,
  ReleaseTrack
} from '@shared/domain/discography'
import {
  RELEASE_KIND_LABEL,
  RELEASE_STATUS_LABEL,
  billedAs,
  canvasIsVideo,
  canvasMimeFor,
  distributionLabel,
  extensionOf,
  featuring,
  formatIsrc,
  trackFeatureIds,
  withoutStream
} from '@shared/domain/discography.constants'
import { ARTIST_ROLE_CREDIT } from '@shared/domain/artists.constants'
import type { ProjectSummary } from '@shared/domain/projects'
import { Button } from '@renderer/components/primitives/Button'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { Panel } from '@renderer/components/primitives/Panel'
import { Plate } from '@renderer/components/primitives/Plate'
import { gridVariants } from '@renderer/motion/transitions'
import { formatBytes, formatCountdown, formatIsoDate } from '@renderer/lib/format'
import styles from '../DiscographyPage.module.scss'
import * as shell from '@renderer/lib/shell'

export interface ReleaseDetailsProps {
  release: DiscographyRelease
  roster: readonly ArtistRecord[]
  /** For naming the project behind a track, where there is one. */
  projects: readonly ProjectSummary[]
  /** Every record, for naming the one a row points at. */
  releases: readonly DiscographySummary[]
  /**
   * Open another record.
   *
   * A row that names a release is the one thing on this page that refers
   * to something the catalogue can show, so it is the one thing worth
   * being able to follow. Optional, so the record reads the same without
   * a way to navigate.
   */
  onOpenRelease?: (releaseId: string) => void
}

/** Nothing recorded. One dash, everywhere, so a gap always looks the same. */
const NONE = '—'

/** Which artefact the hero is showing. */
type Facet = 'cover' | 'canvas'

/**
 * A release, read rather than edited.
 *
 * ## Why this exists at all
 *
 * The sheet has been read-only by default since D24, and that first pass did
 * it by disabling the form — which the operator called what it was. A greyed
 * out form is not a record: it is twelve input boxes with their affordances
 * switched off, and it reads as broken rather than as finished. So there are
 * two renderings of one release, and this is the one you get on open.
 *
 * ## It cannot write, rather than declining to
 *
 * No `onPatch`, no mutation props, no state beyond which artefact the hero is
 * showing. The read view's inability to change the record is structural —
 * there is nothing here to disable, and nothing for a future edit to leak
 * through. `ReleaseSheet` still owns the form.
 *
 * ## The cover leads
 *
 * *"The cover art should be the highlight, along with the title and artist
 * name, the user has a chance to swap to see the canvas too."*
 *
 * So the record opens on a hero band rather than a field grid: the artefact
 * large on the left, the title set as a title on the right, and who it is by
 * under it. D12 had already said the cover is "the one thing on a release
 * worth drawing large" and then only honoured it on a tab you had to go and
 * find; here it is the first thing the record says.
 *
 * **No panel carries `focal`.** The house rule is at most one, and the
 * accent's job — say which object the view is about — is done here by scale.
 * A crimson edge drawn around artwork would fight the artwork, which is the
 * one thing on this page that must not be competed with.
 *
 * ## The house record idiom below it
 *
 * Numbered `Panel`s in a six-column grid holding `Field`/`FieldGrid` pairs —
 * the same language `DossierRecord` uses for a project, because a release and
 * a project are the console's two record surfaces and should not be read
 * differently.
 *
 * ## One page, no tabs, and this does not undo D12
 *
 * D12 moved the *form* off a single scroll, and named its reasons precisely:
 * "twelve fields, a credit picker, a tracklist, six identifiers and two asset
 * wells in a single scroll". Every item on that list is an editing affordance.
 * None of them is here — twelve fields are twelve lines of type, the credit
 * picker is two lines of credits, the two wells are one hero. What D12 costed
 * was working at one altitude, not reading at it.
 *
 * ## Every field shows, and a gap reads as a dash
 *
 * Deliberately not hidden. This sheet's job is getting a release complete
 * enough to go out, and `publish` refuses on a missing date, artwork or
 * master — so the panels double as the pre-flight check that says which one is
 * missing. Empty sections say so in words for the same reason, which also
 * means no panel ever has to renumber itself the way `DossierRecord`'s
 * conditional one does.
 */
export function ReleaseDetails({
  release,
  roster,
  projects,
  releases,
  onOpenRelease
}: ReleaseDetailsProps): ReactNode {
  const names = new Map(roster.map((artist) => [artist.id, artist.name]))
  const nameOf = (ids: readonly string[]): string[] =>
    ids.map((id) => names.get(id)).filter((name): name is string => Boolean(name))

  const projectNames = new Map(projects.map((project) => [project.id, project.name]))
  /** Titles for the rows that name a release, so one can be drawn as a link. */
  const releaseTitles = new Map(releases.map((entry) => [entry.id, entry.title]))

  const out = release.status === 'released'
  const mastered = release.tracks.filter((track) => track.master !== null).length
  const missing = withoutStream(release.distribution)
  const order = [...release.tracks].sort((left, right) => left.position - right.position)
  const featured = nameOf(release.featuredArtistIds)

  return (
    /*
     * The stagger has to be driven from here.
     *
     * `Panel` declares `panelVariants` but no `initial`/`animate` of its own —
     * it inherits the state from whatever lays it out. A plain `div` therefore
     * renders a grid of panels at `opacity: 0`: present, occupying space, and
     * completely invisible. `DossierGrid` exists to stop exactly that
     * regressing, and its comment is worth reading before changing this line.
     */
    <motion.div
      className={styles.detailsGrid}
      variants={gridVariants}
      initial="initial"
      animate="animate"
    >
      {/*
        Unnumbered and unlabelled, like the dossier's masthead: the numbered
        panels are the sections of a record, and this is the record's face.
      */}
      <Panel className={styles.detailsSpan6} flush>
        <div className={styles.hero}>
          <Artefacts release={release} />

          <div className={styles.heroIdentity}>
            <h3 className={styles.heroTitle}>{release.title}</h3>

            {release.subtitle ? <p className={styles.heroSubtitle}>{release.subtitle}</p> : null}

            {/*
              Billed as, then featuring — the distinction the schema draws
              between how a release is *titled* and who worked on it. Drawn
              even when nobody is credited, because `Uncredited` is a fact
              about the record and a blank line is not.
            */}
            <p className={styles.heroBy} data-none={release.artistIds.length === 0 || undefined}>
              {billedAs(nameOf(release.artistIds)) || 'Uncredited'}
              {featured.length > 0 ? (
                <span className={styles.heroFeature}>{featuring(featured)}</span>
              ) : null}
            </p>

            {/*
              The register's own line: a run of readings separated by rules
              rather than a set of boxes, exactly as the dossier masthead
              draws a project's figures.
            */}
            <div className={styles.heroFigures}>
              <span className={styles.heroFigureKind} title="Kind">
                {RELEASE_KIND_LABEL[release.kind]}
              </span>
              <span className={styles.heroFigure} title="Status">
                {RELEASE_STATUS_LABEL[release.status]}
              </span>
              <span className={styles.heroFigure} title="Release date">
                {formatIsoDate(release.releaseDate)}
              </span>
              {/*
                Gold only while it is still a live question. Once the record is
                out the countdown is history and the date above says it.
              */}
              {out ? null : (
                <span className={`${styles.heroFigure} ${styles.detailsLive}`} title="Countdown">
                  {formatCountdown(release.releaseDate)}
                </span>
              )}
              <span className={styles.heroFigure} title="Running order">
                {order.length} track{order.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>
      </Panel>

      <Panel label="Credits" index="01" className={styles.detailsSpan3}>
        {release.credits.length === 0 ? (
          <p className={styles.detailsEmpty}>
            No liner-note credits. A single put out alone carries none, and an empty list is the
            honest record of that.
          </p>
        ) : (
          <FieldGrid columns={1}>
            {release.credits.map((credit) => (
              <Field
                key={credit.id}
                label={ARTIST_ROLE_CREDIT[credit.role]}
                value={billedAs(nameOf(credit.artistIds)) || NONE}
                hint={credit.note || undefined}
              />
            ))}
          </FieldGrid>
        )}
      </Panel>

      <Panel label="Trade" index="02" className={styles.detailsSpan3}>
        <FieldGrid columns={2}>
          <Field label="Label" value={release.label || 'Self-released'} />
          <Field label="Catalogue number" value={release.catalogueNumber || NONE} mono selectable />
          <Field label="UPC" value={release.upc || NONE} mono selectable />
          <Field label="Label URL" value={release.labelUrl || NONE} mono selectable />
          <Field label="℗ Phonographic" value={release.phonographicLine || NONE} />
          <Field label="© Copyright" value={release.copyrightLine || NONE} />
        </FieldGrid>
      </Panel>

      <Panel
        label="Running order"
        index="03"
        className={styles.detailsSpan6}
        aside={order.length > 0 ? `${mastered}/${order.length} mastered` : undefined}
      >
        {order.length === 0 ? (
          <p className={styles.detailsEmpty}>
            No tracks yet. A release cannot be published without at least one.
          </p>
        ) : (
          <ol className={styles.detailsTracks}>
            {order.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                release={release}
                nameOf={nameOf}
                projectName={track.projectId ? projectNames.get(track.projectId) : undefined}
                fromTitle={track.releaseId ? releaseTitles.get(track.releaseId) : undefined}
                onOpenRelease={onOpenRelease}
              />
            ))}
          </ol>
        )}
      </Panel>

      <Panel
        label="Distribution"
        index="04"
        className={styles.detailsSpan6}
        // Only once it is out: before then an empty stream slot is simply
        // where a release starts, and counting it would warn about nothing.
        aside={
          out && missing > 0
            ? `${release.distribution.length - missing}/${release.distribution.length} live`
            : undefined
        }
      >
        {release.distribution.length === 0 ? (
          <p className={styles.detailsEmpty}>
            No platforms yet. Add the stores this goes out on, and the pre-save links with them.
          </p>
        ) : (
          <ul className={styles.detailsPlatforms}>
            {release.distribution.map((entry) => (
              <li key={entry.id} className={styles.detailsPlatform}>
                <span className={styles.detailsPlatformName}>{distributionLabel(entry)}</span>

                <AddressSlot label="Pre-save" url={entry.presaveUrl} />
                <AddressSlot
                  label="Stream"
                  url={entry.streamUrl}
                  // The one absence worth pointing at rather than dashing:
                  // a record that is out and has nowhere to send anybody.
                  wanted={out}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel label="Notes" index="05" className={styles.detailsSpan6}>
        {release.notes ? (
          <p className={styles.detailsNotes}>{release.notes}</p>
        ) : (
          <p className={styles.detailsEmpty}>
            Nothing noted. Who mastered it, what the deal was, what to remember next time.
          </p>
        )}
      </Panel>
    </motion.div>
  )
}

/**
 * The cover, large, and the canvas behind a swap.
 *
 * Two artefacts in one well rather than two wells side by side. They are the
 * same object seen two ways — the square a store shows and the vertical loop a
 * phone plays — and putting them next to each other at half size each would
 * make neither the highlight, which is the one thing the operator asked for.
 */
function Artefacts({ release }: { release: DiscographyRelease }): ReactNode {
  const [facet, setFacet] = useState<Facet>('cover')

  const canvasPath = release.canvas.copiedPath
  const showing: Facet = facet === 'canvas' && canvasPath ? 'canvas' : 'cover'
  const reveal = showing === 'canvas' ? canvasPath : release.artwork.copiedPath

  return (
    <div className={styles.heroArtefacts}>
      <div className={styles.heroWell}>
        {showing === 'cover' ? (
          <Plate path={release.artwork.copiedPath} fallback="COVER" fill alt="Cover art" />
        ) : (
          <CanvasFilm path={canvasPath as string} />
        )}
      </div>

      {/*
        Two chips rather than one toggle. A single button reading CANVAS would
        have to be read as either "you are looking at the canvas" or "press to
        see the canvas" and cannot say which; a pair with one lit says both at
        once. The same chip the sheet's form uses for kind and status.
      */}
      <div className={styles.heroSwap}>
        <button
          type="button"
          className={styles.chip}
          data-on={showing === 'cover' || undefined}
          aria-pressed={showing === 'cover'}
          onClick={() => setFacet('cover')}
        >
          Cover
        </button>
        <button
          type="button"
          className={styles.chip}
          data-on={showing === 'canvas' || undefined}
          aria-pressed={showing === 'canvas'}
          disabled={!canvasPath}
          title={canvasPath ?? 'No canvas attached'}
          onClick={() => setFacet('canvas')}
        >
          Canvas
        </button>

        {reveal ? (
          <Button
            size="sm"
            variant="ghost"
            className={styles.heroReveal}
            title={reveal}
            onClick={() => shell.reveal(reveal)}
          >
            Reveal
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * The canvas, played.
 *
 * ## Why the bytes come over the bridge
 *
 * The renderer's CSP is `media-src 'self' blob:` and there is no `file:`
 * anywhere in it, which is not an oversight — it is what stops a compromised
 * renderer reading the drive through a media element. So `discography:canvas`
 * hands over the bytes and this wraps them in a blob URL, which is the same
 * route the listening room takes for a master.
 *
 * The media type on the `Blob` is **load-bearing**, for the reason
 * `AUDIO_MIME` documents at length: Chromium does not sniff a blob the way it
 * sniffs a network response, so a wrong type produces an element that loads,
 * reports a size, and then fails to decode without saying why.
 *
 * ## One piece of state, keyed by its path
 *
 * Copied from `Plate`, and for its reason: separate `url` and `error` flags
 * would both have to be *cleared* when the path changes, and clearing them in
 * the body of an effect is a synchronous `setState` that cascades a second
 * render before paint — which `react-hooks/set-state-in-effect` refuses, and
 * rightly. Holding the value beside the path it belongs to lets render decide
 * whether what is held is still the right film, with nothing to reset.
 *
 * A GIF never reaches here: `canvasIsVideo` sends it to `Plate` instead,
 * because `img-src` does not allow `blob:` and widening it to animate a format
 * nobody delivers a canvas in would be the wrong trade.
 */
function CanvasFilm({ path }: { path: string }): ReactNode {
  const [held, setHeld] = useState<{
    path: string
    url: string | null
    reason: string | null
  } | null>(null)

  useEffect(() => {
    if (!canvasIsVideo(extensionOf(path))) return

    let alive = true
    let made: string | null = null

    void window.candy.discography
      .canvas(path)
      .then((payload) => {
        if (!alive) return
        made = URL.createObjectURL(
          new Blob([payload.bytes], { type: canvasMimeFor(payload.extension) })
        )
        setHeld({ path, url: made, reason: null })
      })
      .catch((cause: unknown) => {
        if (!alive) return
        setHeld({
          path,
          url: null,
          reason: cause instanceof Error ? cause.message : 'That canvas could not be read.'
        })
      })

    return () => {
      alive = false
      // Revoked as the path changes, not only on unmount: a session spent
      // reading through a catalogue would otherwise hold every canvas it had
      // looked at in memory.
      if (made) URL.revokeObjectURL(made)
    }
  }, [path])

  // A GIF is an image. It goes through the thumbnail channel and draws as a
  // still — see `canvasIsVideo`.
  if (!canvasIsVideo(extensionOf(path))) {
    return <Plate path={path} fallback="CANVAS" fill alt="Canvas" />
  }

  const ready = held && held.path === path ? held : null

  if (!ready) {
    return <span className={styles.heroWait}>LOADING CANVAS</span>
  }

  if (!ready.url) {
    return <span className={styles.heroWait}>{ready.reason}</span>
  }

  return (
    <video
      className={styles.heroFilm}
      src={ready.url}
      // Muted, looped and silent by default: a canvas is a nine-second loop
      // with no sound of its own, and the operator pressed CANVAS to watch it
      // rather than to be asked a second time.
      autoPlay
      loop
      muted
      playsInline
      controls={false}
    />
  )
}

interface TrackRowProps {
  track: ReleaseTrack
  release: DiscographyRelease
  nameOf: (ids: readonly string[]) => string[]
  projectName: string | undefined
  /** The title of the record this row points at, when it resolves. */
  fromTitle: string | undefined
  onOpenRelease?: (releaseId: string) => void
}

/**
 * One line of the running order.
 *
 * The feature list is the track's own artists **minus** the release's mains,
 * through `trackFeatureIds` — the same subtraction the published filenames
 * make, and for the same reason: `addTrack` copies a project's credits onto
 * the track, so the raw ids routinely include the artist the release is
 * already billed to.
 */
function TrackRow({
  track,
  release,
  nameOf,
  projectName,
  fromTitle,
  onOpenRelease
}: TrackRowProps): ReactNode {
  const also = nameOf(trackFeatureIds(track.artistIds, release.artistIds))

  return (
    <li className={styles.detailsTrack}>
      <span className={styles.detailsTrackNumber}>{String(track.position).padStart(2, '0')}</span>

      <span className={styles.detailsTrackBody}>
        <span className={styles.detailsTrackTitle}>
          {track.title || 'Untitled'}
          {also.length > 0 ? (
            <span className={styles.detailsTrackFeature}>{featuring(also)}</span>
          ) : null}
        </span>

        <span className={styles.detailsTrackMeta}>
          {track.isrc ? formatIsrc(track.isrc) : 'No ISRC'}
          {' · '}
          {projectName ?? 'No project linked'}
        </span>

        {/*
          Drawn here and nowhere else in the department. A track note is
          stored by `TrackDialog` and then has no surface at all — the running
          order has no room for it and the form never asks again. A record
          that claims to tell you everything is the right place for the one
          field that had nothing.
        */}
        {track.notes ? <span className={styles.detailsTrackNote}>{track.notes}</span> : null}

        {/*
          The record this recording also exists as on its own.

          A track promoted out of an EP has its own entry, and this is the
          way to it — the running order is where anybody looking at an EP
          would expect to reach its tracks, and before this there was
          nothing here to follow. Drawn as a link only when there is
          somewhere to go; a pointer whose record has been deleted
          resolves to nothing and is quietly not drawn.
        */}
        {fromTitle && track.releaseId ? (
          onOpenRelease ? (
            <button
              type="button"
              className={styles.detailsTrackFrom}
              onClick={() => onOpenRelease(track.releaseId as string)}
              title={`Open ${fromTitle}`}
            >
              Open {fromTitle}
            </button>
          ) : (
            <span className={styles.detailsTrackNote}>From {fromTitle}</span>
          )
        ) : null}
      </span>

      {/*
        The file that shipped, and the way to it. Reported the way the ARCHIVE's
        own record reports the same fact, down to the byte size beside it.
      */}
      {track.master ? (
        <span className={styles.detailsTrackMaster}>
          <span className={styles.detailsTrackFile} title={track.master.path}>
            ♪ {track.master.fileName}
          </span>
          <span className={styles.detailsTrackBytes}>{formatBytes(track.master.sizeBytes)}</span>
          <Button
            size="sm"
            variant="ghost"
            title={track.master.path}
            onClick={() => shell.reveal(track.master!.path)}
          >
            Reveal
          </Button>
        </span>
      ) : (
        <span className={styles.detailsTrackNone}>No master — this track would be skipped</span>
      )}
    </li>
  )
}

/**
 * A pre-save or stream address.
 *
 * `wanted` marks the absence as outstanding rather than merely empty, which is
 * true of exactly one case: a stream link on a release that is already out.
 */
function AddressSlot({
  label,
  url,
  wanted = false
}: {
  label: string
  url: string
  wanted?: boolean
}): ReactNode {
  return (
    <span className={styles.detailsSlot}>
      <span className={styles.detailsSlotLabel}>{label}</span>
      {url ? (
        <Button size="sm" variant="ghost" title={url} onClick={() => shell.openExternal(url)}>
          Open
        </Button>
      ) : (
        <span className={wanted ? styles.detailsLive : styles.detailsSlotNone}>
          {wanted ? 'no link yet' : NONE}
        </span>
      )}
    </span>
  )
}
