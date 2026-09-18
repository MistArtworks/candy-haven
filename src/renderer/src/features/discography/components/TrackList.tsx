import { useMemo, useState, type ReactNode } from 'react'
import type { ArtistRecord } from '@shared/domain/artists'
import type { ReleaseTrack, TrackPatch } from '@shared/domain/discography'
import { MAX_TRACK_TITLE, formatIsrc, isValidIsrc } from '@shared/domain/discography.constants'
import type { ProjectSummary } from '@shared/domain/projects'
import { Button } from '@renderer/components/primitives/Button'
import { formatBytes } from '@renderer/lib/format'
import { MasterPicker } from './MasterPicker'
import styles from './TrackList.module.scss'

export interface TrackListProps {
  tracks: readonly ReleaseTrack[]
  /**
   * How many tracks this release's kind may hold — see `maxTracksFor`.
   *
   * Passed in rather than derived from a `kind` prop, so this component never
   * has to know the taxonomy. It draws a list against a ceiling.
   */
  maxTracks: number
  /**
   * The whole register, for *resolving* a link a track already holds.
   *
   * Deliberately not the same list the picker offers. A track can legitimately
   * point at an unfiled project — linked before it was filed, or linked from
   * the project's own dossier — and resolving against the narrower list would
   * draw it as "no longer in the register", which is alarming and false.
   */
  projects: readonly ProjectSummary[]
  /**
   * Finished work not already here. What the picker may offer.
   *
   * Filed, at TRACK READY or RELEASED, and not already on this release — see
   * `LINKABLE_PROJECT_STAGES`. The service refuses anything else, so this is
   * the courtesy rather than the guard.
   */
  linkable: readonly ProjectSummary[]
  roster: readonly ArtistRecord[]
  busy: boolean
  /** Opens the add-a-track dialog; the page owns the form. */
  onAdd: () => void
  onPatch: (trackId: string, patch: TrackPatch) => void
  onRemove: (trackId: string) => void
  onReorder: (trackIds: string[]) => void
  /**
   * Names the file that shipped as this track, or clears it with null.
   *
   * Its own callback rather than part of `onPatch`, because it is a choice
   * against the linked project's inventory that the service validates — not a
   * field. See `discography:track-set-master`.
   */
  onSetMaster: (trackId: string, path: string | null) => void
}

/**
 * The running order, and what each track is.
 *
 * ## Why a track can have no project
 *
 * Because most of a discography does not. Everything released before this
 * application existed, everything a label mastered, every remix somebody else
 * made — none of that has an Ableton project on this disk, and a catalogue
 * that could only describe work it also held would not be a discography.
 *
 * So `projectId` is nullable and the link is offered rather than required.
 * Tracks that do have one say so, and the ARCHIVE reads the same link from
 * the other end — see `DiscographyService.appearances`.
 *
 * What the picker *offers* is **finished** work only — filed, and at TRACK
 * READY or RELEASED. Everything the scanner found loose in an intake root is
 * in the register too, and offering it made the list a wall of `Untitled` and
 * `ting` with the real work buried in it. A track on a release is finished
 * work, so the ARCHIVE's pipeline is the gate: see `LINKABLE_PROJECT_STAGES`.
 *
 * ## The master
 *
 * Each linked track can name which of its project's bounces actually shipped.
 * That pick used to live in the dossier, as `masters.final`, and promoting one
 * *moved* the file into `Release Mastered Tracks`. It is here now, and it
 * references the file in place — see `MasterPicker`.
 *
 * Adding one opens a dialog rather than a field in this list, because a
 * track is a title *and* a project *and* credits *and* an ISRC — four
 * decisions, which is a form. The inline field that used to sit here could
 * only take the title, so every other field meant adding the track and then
 * editing it.
 *
 * Reordering is up/down rather than drag. The list is short by nature, the
 * ARCHIVE's drag layer is built around filing into folders rather than
 * ordering within a list, and a numbered running order is exactly the thing
 * an operator wants to nudge by one rather than fling.
 */
export function TrackList({
  tracks,
  maxTracks,
  projects,
  linkable,
  roster,
  busy,
  onAdd,
  onPatch,
  onRemove,
  onReorder,
  onSetMaster
}: TrackListProps): ReactNode {
  const [linking, setLinking] = useState<string | null>(null)
  /** Which track is choosing a master, by id. One at a time, as linking is. */
  const [mastering, setMastering] = useState<string | null>(null)

  const names = useMemo(() => new Map(roster.map((artist) => [artist.id, artist.name])), [roster])

  const move = (index: number, delta: number): void => {
    const next = [...tracks]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onReorder(next.map((track) => track.id))
  }

  return (
    <div className={styles.list}>
      {tracks.length === 0 ? (
        <p className={styles.empty}>
          No tracks yet. Add one by name, or link a project from the ARCHIVE — a track does not need
          a project behind it.
        </p>
      ) : (
        <ol className={styles.tracks}>
          {tracks.map((track, index) => {
            const project = track.projectId
              ? projects.find((entry) => entry.id === track.projectId)
              : null
            const credits = track.artistIds
              .map((id) => names.get(id))
              .filter((name): name is string => Boolean(name))

            return (
              <li key={track.id} className={styles.track}>
                <span className={styles.position}>{String(track.position).padStart(2, '0')}</span>

                <div className={styles.details}>
                  <input
                    className={styles.title}
                    value={track.title}
                    maxLength={MAX_TRACK_TITLE}
                    aria-label={`Track ${track.position} title`}
                    onChange={(event) => onPatch(track.id, { title: event.target.value })}
                  />

                  <div className={styles.meta}>
                    {/*
                      The link, stated either way round. A track with no
                      project is an ordinary state and says so plainly rather
                      than showing an empty slot that reads as a fault.
                    */}
                    {project ? (
                      <span className={styles.linked} title={project.path}>
                        ◆ {project.name}
                      </span>
                    ) : track.projectId ? (
                      <span className={styles.dangling}>Project no longer in the register</span>
                    ) : (
                      <span className={styles.unlinked}>No project</span>
                    )}

                    {credits.length > 0 ? (
                      <span className={styles.credits}>{credits.join(', ')}</span>
                    ) : null}

                    {track.isrc ? (
                      <span
                        className={styles.isrc}
                        data-bad={!isValidIsrc(track.isrc) || undefined}
                        title={isValidIsrc(track.isrc) ? undefined : 'Not a valid ISRC'}
                      >
                        {formatIsrc(track.isrc)}
                      </span>
                    ) : null}

                    {/*
                      The file that shipped, with a way to it.

                      Drawn beside the link because the two are one fact read
                      at two depths: which project the track came from, and
                      which bounce out of that project actually went out. A
                      linked track with no master is incomplete rather than
                      broken, and says so only when there is a project it
                      could have come from.
                    */}
                    {track.master ? (
                      /*
                       * An anchor rather than a button, and that is
                       * load-bearing. `fieldset[disabled]` reaches every
                       * form control beneath it — which is what makes it
                       * the right lock for the sheet body — and it does
                       * not reach an `a`. Showing a file in Explorer is
                       * reading, and the sheet is read-only by default,
                       * so this has to survive the lock.
                       */
                      <a
                        className={styles.master}
                        role="button"
                        tabIndex={0}
                        title={`${track.master.path} — click to show in Explorer`}
                        onClick={() => void window.candy.shell.reveal(track.master!.path)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            void window.candy.shell.reveal(track.master!.path)
                          }
                        }}
                      >
                        ♪ {track.master.fileName}
                        <span className={styles.masterBytes}>
                          {formatBytes(track.master.sizeBytes)}
                        </span>
                      </a>
                    ) : project ? (
                      <span className={styles.noMaster}>No master chosen</span>
                    ) : null}
                  </div>

                  {linking === track.id ? (
                    <div className={styles.picker}>
                      {/*
                        An empty list gets a sentence, not a select with one
                        option in it. "Nothing is finished yet" and "there are
                        no projects" look identical in a dropdown and mean
                        different things, and only one of them tells the
                        operator what to go and do.
                      */}
                      {linkable.length === 0 && !track.projectId ? (
                        <p className={styles.pickerEmpty}>
                          Nothing is at TRACK READY. Move a project there in the ARCHIVE and it can
                          be linked here.
                        </p>
                      ) : null}
                      <select
                        className={styles.select}
                        aria-label="Link a project"
                        defaultValue={track.projectId ?? ''}
                        onChange={(event) => {
                          onPatch(track.id, { projectId: event.target.value || null })
                          setLinking(null)
                        }}
                      >
                        <option value="">No project</option>
                        {linkable.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.name}
                          </option>
                        ))}
                      </select>
                      <Button size="sm" variant="ghost" onClick={() => setLinking(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : null}

                  {mastering === track.id && track.projectId ? (
                    <MasterPicker
                      projectId={track.projectId}
                      chosen={track.master?.path ?? null}
                      busy={busy}
                      onChoose={(path) => onSetMaster(track.id, path)}
                      onCancel={() => setMastering(null)}
                    />
                  ) : null}
                </div>

                <div className={styles.actions}>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setLinking(linking === track.id ? null : track.id)}
                  >
                    {/*
                      Named after what it changes, not after the verb for the
                      relationship. It read "RELINK", which says a link is
                      being remade without saying of what — and the row shows
                      two links, a project and a master. Now it pairs with
                      CHANGE MASTER beside it, and the two read as the two
                      things a track points at.
                    */}
                    {track.projectId ? 'Change project' : 'Link a project'}
                  </Button>

                  {/*
                    Offered only once there is a project behind the track.
                    The candidates are that project's own bounces, so without
                    one there is nothing to choose between — and a live control
                    that can only explain why it cannot work teaches less than
                    its absence does.
                  */}
                  {track.projectId ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setMastering(mastering === track.id ? null : track.id)}
                    >
                      {track.master ? 'Change master' : 'Pick master'}
                    </Button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.nudge}
                    aria-label="Move up"
                    disabled={index === 0 || busy}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={styles.nudge}
                    aria-label="Move down"
                    disabled={index === tracks.length - 1 || busy}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => onRemove(track.id)}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {/*
        The control disappears at the ceiling rather than refusing when
        pressed. A single already holding its track is the ordinary case, and
        a live button whose only outcome is an explanation teaches less than
        a sentence saying what the kind means.
      */}
      {tracks.length < maxTracks ? (
        <div className={styles.add}>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onAdd}>
            Add a track
          </Button>
          <span className={styles.addHint}>
            {tracks.length > 0
              ? 'Joins the end of the running order.'
              : 'By name, or linked to a project in the ARCHIVE.'}
          </span>
        </div>
      ) : (
        <p className={styles.addHint}>
          {maxTracks === 1
            ? 'This kind holds one track. Change it to EP if the release carries more than one recording.'
            : `That is the ceiling of ${maxTracks} tracks.`}
        </p>
      )}
    </div>
  )
}
