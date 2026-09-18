import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import type { ArtistRecord } from '@shared/domain/artists'
import type { DiscographyRelease, ReleaseTrack } from '@shared/domain/discography'
import {
  RELEASE_KIND_LABEL,
  RELEASE_STATUS_LABEL,
  billedAs,
  distributionLabel,
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

export interface ReleaseDetailsProps {
  release: DiscographyRelease
  roster: readonly ArtistRecord[]
  /** For naming the project behind a track, where there is one. */
  projects: readonly ProjectSummary[]
}

/** Nothing recorded. One dash, everywhere, so a gap always looks the same. */
const NONE = '—'

/**
 * A release, read rather than edited.
 *
 * ## Why this exists at all
 *
 * The sheet has been read-only by default since D24, and that first pass did
 * it by disabling the form — which the operator called what it was. A greyed
 * out form is not a record: it is twelve input boxes with their affordances
 * switched off, and it reads as broken rather than as finished. So there are
 * two renderings of one release now, and this is the one you get on open.
 *
 * ## It cannot write, rather than declining to
 *
 * No `onPatch`, no mutation props, no local state. The read view's inability
 * to change the record is structural — there is nothing here to disable, and
 * nothing for a future edit to leak through. `ReleaseSheet` still owns the
 * form and hands out the same props it always did.
 *
 * ## The house record idiom, not a new one
 *
 * Numbered `Panel`s in a six-column grid holding `Field`/`FieldGrid` pairs —
 * the same language `DossierRecord` uses for a project, because a release and
 * a project are the console's two record surfaces and should not be read
 * differently. The alternative was inventing a sixth presentation, which is
 * how a design language dies.
 *
 * ## One page, no tabs, and this does not undo D12
 *
 * D12 moved the *form* off a single scroll, and named its reasons precisely:
 * "twelve fields, a credit picker, a tracklist, six identifiers and two asset
 * wells in a single scroll". Every item on that list is an editing affordance.
 * None of them is here — twelve fields are twelve lines of type, the credit
 * picker is two lines of credits, the two wells are one cover. What D12 costed
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
export function ReleaseDetails({ release, roster, projects }: ReleaseDetailsProps): ReactNode {
  const names = new Map(roster.map((artist) => [artist.id, artist.name]))
  const nameOf = (ids: readonly string[]): string[] =>
    ids.map((id) => names.get(id)).filter((name): name is string => Boolean(name))

  const projectNames = new Map(projects.map((project) => [project.id, project.name]))

  const out = release.status === 'released'
  const mastered = release.tracks.filter((track) => track.master !== null).length
  const missing = withoutStream(release.distribution)
  const order = [...release.tracks].sort((left, right) => left.position - right.position)

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
      <Panel label="The release" index="01" className={styles.detailsSpan4}>
        <div className={styles.detailsStack}>
          <FieldGrid columns={2}>
            <Field label="Subtitle" value={release.subtitle || NONE} />
            <Field label="Kind" value={RELEASE_KIND_LABEL[release.kind]} />
            <Field label="Status" value={RELEASE_STATUS_LABEL[release.status]} />
            <Field label="Release date" value={formatIsoDate(release.releaseDate)} mono />
            {/*
              How long until it is out, and gold while that is still a live
              question. `formatCountdown` reads UNDATED for a null date, which
              is the honest answer for a release nobody has fixed a day for.
            */}
            <Field
              label={out ? 'Out' : 'Countdown'}
              value={
                out ? (
                  formatIsoDate(release.releaseDate)
                ) : (
                  <span className={styles.detailsLive}>{formatCountdown(release.releaseDate)}</span>
                )
              }
              mono
            />
          </FieldGrid>

          <FieldGrid columns={1}>
            <Field label="Notes" value={release.notes || NONE} selectable />
          </FieldGrid>
        </div>
      </Panel>

      {/*
        The cover, large, because D12 already settled that it is "the one thing
        on a release worth drawing large" — the masthead's 96px plate says
        which record is open, and this is the record.
      */}
      <Panel label="Artefacts" index="02" className={styles.detailsSpan2}>
        <div className={styles.detailsArtefacts}>
          <Plate path={release.artwork.copiedPath} fallback="COVER" size={168} alt="Cover art" />

          <FieldGrid columns={1}>
            <Field label="Cover art" value={release.artwork.copiedPath ? 'Attached' : NONE} />
            <Field label="Spotify canvas" value={release.canvas.copiedPath ? 'Attached' : NONE} />
          </FieldGrid>

          {release.artwork.copiedPath ? (
            <Button
              size="sm"
              variant="ghost"
              title={release.artwork.copiedPath}
              onClick={() => void window.candy.shell.reveal(release.artwork.copiedPath!)}
            >
              Reveal cover
            </Button>
          ) : null}
        </div>
      </Panel>

      <Panel label="Credits" index="03" className={styles.detailsSpan3}>
        <div className={styles.detailsStack}>
          {/*
            How it is billed, then who did the work — the distinction
            `ReleaseCreditSchema` draws. `billedAs` is the same function that
            names the published folder, so the sheet and the distributor read
            the record the same way.
          */}
          <FieldGrid columns={1}>
            <Field label="Main artist" value={billedAs(nameOf(release.artistIds)) || NONE} />
            <Field
              label="Featuring"
              value={billedAs(nameOf(release.featuredArtistIds)) || NONE}
            />
          </FieldGrid>

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
        </div>
      </Panel>

      <Panel label="Trade" index="04" className={styles.detailsSpan3}>
        <FieldGrid columns={2}>
          <Field label="Label" value={release.label || 'Self-released'} />
          <Field label="Catalogue number" value={release.catalogueNumber || NONE} mono selectable />
          <Field
            label="UPC"
            value={release.upc || NONE}
            mono
            selectable
            hint="Identifies the product. An ISRC identifies a recording and sits on the track."
          />
          <Field label="℗ Phonographic" value={release.phonographicLine || NONE} />
          <Field label="© Copyright" value={release.copyrightLine || NONE} />
          <Field label="Label URL" value={release.labelUrl || NONE} mono selectable />
        </FieldGrid>
      </Panel>

      {/*
        The substance of a release, and so the one focal panel — as set
        analysis is on a project's record. At most one per view, by house rule.
      */}
      <Panel
        label="Running order"
        index="05"
        className={styles.detailsSpan6}
        aside={order.length > 0 ? `${mastered}/${order.length} mastered` : undefined}
        focal
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
              />
            ))}
          </ol>
        )}
      </Panel>

      <Panel
        label="Distribution"
        index="06"
        className={styles.detailsSpan6}
        // Only once it is out: before then an empty stream slot is simply
        // where a release starts, and counting it would warn about nothing.
        aside={out && missing > 0 ? `${release.distribution.length - missing}/${release.distribution.length} live` : undefined}
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
    </motion.div>
  )
}

interface TrackRowProps {
  track: ReleaseTrack
  release: DiscographyRelease
  nameOf: (ids: readonly string[]) => string[]
  projectName: string | undefined
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
function TrackRow({ track, release, nameOf, projectName }: TrackRowProps): ReactNode {
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
          stored by `TrackDialog` and then has no surface at all — the
          running order has no room for it and the form never asks again.
          A record that claims to tell you everything is the right place
          for the one field that had nothing.
        */}
        {track.notes ? (
          <span className={styles.detailsTrackNote}>{track.notes}</span>
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
            onClick={() => void window.candy.shell.reveal(track.master!.path)}
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
        <Button
          size="sm"
          variant="ghost"
          title={url}
          onClick={() => void window.candy.shell.openExternal(url)}
        >
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
