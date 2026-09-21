/**
 * Decide what the deterministic rungs could not.
 *
 * Spotify, Apple, Deezer and TIDAL are joined by UPC or ISRC, so those links
 * are exact and nothing here touches them. SoundCloud and YouTube carry
 * neither identifier — only a title — and a title is where the hard cases
 * live:
 *
 *   YKWIL (Candy Heist Remix)   vs  You Know What I Like (Candy Heist Remix)
 *   For The Record              vs  For The Record - Radio Edit
 *
 * The first pair is one recording under two names. The second is two
 * recordings of one song. No amount of string normalising tells them apart,
 * and getting it wrong in either direction is destructive: merge the radio
 * edit and a record disappears; split the abbreviation and the catalogue grows
 * a duplicate.
 *
 * ## This file is a set of questions, and nothing else
 *
 * The asking, the concurrency, the retries, the banding and the "one failure
 * does not sink the run" behaviour all live in `@main/core/oracle`, which
 * knows nothing about music. What is left here is the three questions and the
 * evidence they need — which is the part that is actually about a discography.
 *
 * Three stages, because the second question depends on the first:
 *
 *   1. `identify`  which released recording is this, if any?
 *   2. `nature`    — when it is none of them — is this even a recording?
 *   3. `identity`  — when it is one of them — is it the same master?
 *
 * Folding those into one question would make the option list the product of
 * the branches, and the probabilities worse for it.
 *
 * ## Give it the evidence, not just the titles
 *
 * The first run withheld the artists and the durations and asked the model to
 * compare two strings. Every merge came back in the middle band, correctly —
 * "Float - Candy Heist, V3K, Circle Tone" against a bare "FLOAT" is genuinely
 * undecidable until you can see that FLOAT's artists *are* V3K, Candy Heist
 * and Circle Tone. Uploads name collaborators in the title where stores name
 * them in a field, so both are in the question.
 *
 * ## Without a key
 *
 * Every undecided upload is flagged for the operator with a `drop` proposal.
 * Flagging is the safe default in both directions: a dropped upload is one the
 * operator ticks back on in review, where an auto-merge they never saw would
 * be a record silently folded into another.
 */
import { choice, describe, jevFor, noul, runPipeline, type Stage } from '@main/core/oracle'
import { clock } from './normalise'
import type { SeedReporter } from './reporter'
import type { SeedChoice } from '@shared/domain/seed'
import type { SpotifyHarvest } from './sources/spotify'
import type { SoundcloudHarvest } from './sources/soundcloud'
import type { YoutubeHarvest } from './sources/youtube'

/** What the pipeline concluded about one upload with no identifier. */
export interface Verdict {
  key: string
  source: 'soundcloud' | 'youtube'
  title: string
  url: string
  /** Set when the upload was matched to a released recording. */
  matchTrackId: string
  matchTitle: string
  /** `recording` · `promo` · `mix` · `other`, for the ones matched to nothing. */
  nature: string
  proposal: SeedChoice
  probability: number
  flagged: boolean
  reason: string
}

/** One upload awaiting judgement. */
interface Upload {
  key: string
  source: 'soundcloud' | 'youtube'
  title: string
  url: string
  note: string
}

/** A released recording an upload might turn out to be. */
interface Candidate {
  id: string
  title: string
  artists: string
  release: string
  label: string
}

/** Carried between the stages. */
interface Carried {
  candidates: Candidate[]
  /** The recording `identify` landed on, or null for "none of them". */
  match: Candidate | null
  /** What `nature` called it, when it ran. */
  nature: string
  /** What `identity` answered, when it ran. */
  identical: number
}

export interface AdjudicateOptions {
  jevApiKey: string
  harvest: SpotifyHarvest
  soundcloud: SoundcloudHarvest
  youtube: YoutubeHarvest
  reporter: SeedReporter
}

export async function adjudicate({
  jevApiKey,
  harvest,
  soundcloud,
  youtube,
  reporter
}: AdjudicateOptions): Promise<{ verdicts: Verdict[]; warnings: string[] }> {
  const warnings: string[] = []
  const artistName = harvest.artist.name

  /*
   * The candidates are his own recordings only.
   *
   * A 25-track compilation he is one song of would otherwise put two dozen
   * other people's tracks into every question — noise that makes the choice
   * harder for no gain, since an upload of his is never going to be somebody
   * else's compilation track.
   */
  const candidates: Candidate[] = harvest.releases
    .filter((release) => release.tracks.length <= 10)
    .flatMap((release) =>
      release.tracks.map((track) => {
        const artists = track.artists.map((person) => person.name).join(', ')
        return {
          id: track.id,
          title: track.title,
          artists,
          release: release.title,
          label: `"${track.title}" by ${artists} — from "${release.title}", ${
            release.releaseDate || 'undated'
          }, ${clock(track.durationMs)}`
        }
      })
    )

  // Everything a title could not settle, from both fuzzy sources.
  const uploads: Upload[] = [
    ...soundcloud.tracks
      .filter((track) => track.found && track.verdict !== 'exact')
      .map((track) => ({
        key: `sc:${track.url}`,
        source: 'soundcloud' as const,
        title: track.title,
        url: track.url,
        note: track.description
      })),
    ...youtube.videos
      .filter((video) => video.verdict !== 'exact')
      .map((video) => ({
        key: `yt:${video.videoId}`,
        source: 'youtube' as const,
        title: video.title,
        url: video.url,
        note: `${video.channel} channel`
      }))
  ]

  reporter.step(
    'jev',
    `${uploads.length} uploads a title could not settle, against ${candidates.length} released recordings`
  )
  reporter.note(
    'jev',
    'Three staged questions: which recording is this · is it even music · is it the same master'
  )

  const oracle = jevFor(jevApiKey)

  if (!oracle) {
    reporter.warn('jev', `no key — all ${uploads.length} come to you instead of being decided`)
    warnings.push(
      `No Jev key, so all ${uploads.length} uncertain uploads are flagged for you rather than decided.`
    )
    return {
      verdicts: uploads.map((upload) => ({
        key: upload.key,
        source: upload.source,
        title: upload.title,
        url: upload.url,
        matchTrackId: '',
        matchTitle: '',
        nature: '',
        proposal: 'drop',
        probability: 0,
        flagged: true,
        reason: 'Nothing adjudicated this — decide it yourself.'
      })),
      warnings
    }
  }

  const criteria = Object.fromEntries([
    ...candidates.map((candidate) => [candidate.id, candidate.label]),
    ['none', 'None of these — a recording the released catalogue does not contain.']
  ])

  const identify: Stage<Upload, Carried> = {
    name: 'identify',
    state: (upload) =>
      describe(
        `An upload by the artist ${artistName}, found on ${upload.source}.`,
        `Title: "${upload.title}"`,
        upload.note !== '' && `Context: ${upload.note.slice(0, 200)}`,
        '',
        'His released catalogue is listed as the options, each with its artists,',
        'its record and its running time. Uploads are routinely titled with the',
        'collaborators written into the title where a store lists them as',
        'artists, and are routinely abbreviated — YKWIL for "You Know What I',
        'Like".'
      ),
    questions: () => ({
      which: choice(
        'Which released recording is this upload, if any? Choose "none" when it is something the catalogue does not contain — a bootleg, a DJ or promo mix, a demo, a teaser clip, or a remix of another artist that was never released.',
        criteria
      )
    }),
    absorb: (answers, _upload, carried) => ({
      ...carried,
      match: carried.candidates.find((entry) => entry.id === answers.which?.choice) ?? null
    })
  }

  /*
   * Not in the catalogue is not the same as "a record we should make".
   *
   * Most of what a musician puts on YouTube is *about* the music rather than
   * the music: teasers, studio clips, pre-save announcements, vlogs. Seeding
   * those as releases would fill the discography with things that are not
   * recordings at all, which is worse than missing an exclusive — a missing
   * record is one row to add, and twenty phantom ones have to be found and
   * deleted.
   */
  const nature: Stage<Upload, Carried> = {
    name: 'nature',
    when: (_upload, carried) => carried.match === null,
    state: (upload) =>
      describe(
        `A ${upload.source} upload by ${artistName} that does not correspond to any released recording.`,
        `Title: "${upload.title}"`,
        upload.note !== '' && `Context: ${upload.note.slice(0, 200)}`
      ),
    questions: () => ({
      kind: choice('What is this upload?', {
        recording:
          'A complete piece of music in its own right — an unreleased track, a bootleg, a remix, an edit. Something a discography entry could reasonably be made for.',
        promo:
          'Material about a track rather than the track: a teaser, a snippet, a studio or process clip, a pre-save or out-now announcement, a live-set clip, a meme or vertical short.',
        mix: 'A DJ mix, radio show or continuous set, rather than a single piece of music.',
        other: 'Not music at all — a vlog, an announcement, a life update, anything else.'
      })
    }),
    absorb: (answers, _upload, carried) => ({
      ...carried,
      nature: answers.kind?.choice ?? 'recording'
    })
  }

  /*
   * Named the same record — but is it the same *recording*?
   *
   * A radio edit and an extended mix are both legitimately "For The Record"
   * and neither is the other. Asked separately from `identify` because that
   * question's job is identification and this one's is identity.
   */
  const identity: Stage<Upload, Carried> = {
    name: 'identity',
    when: (_upload, carried) => carried.match !== null,
    state: (upload, carried) =>
      describe(
        `A — released recording: "${carried.match?.title}" by ${carried.match?.artists}, from "${carried.match?.release}".`,
        `B — ${upload.source} upload: "${upload.title}".`,
        upload.note !== '' && `    B is described as: ${upload.note.slice(0, 200)}`,
        '',
        'A title that merely lists A’s artists, or abbreviates A’s name, is',
        'still A. A title marked radio edit, extended mix, VIP, sped up,',
        'slowed, live, or naming a different remixer is a different recording.'
      ),
    questions: () => ({
      same: noul(
        'Is B the same recording as A, rather than a different version of the same song?',
        'The same master, however the title is written.',
        'A different recording of the same song — a different edit, mix, or remix.'
      )
    }),
    absorb: (answers, _upload, carried) => ({
      ...carried,
      identical: answers.same?.noul ?? 0
    })
  }

  let asked = 0
  const results = await runPipeline(uploads, {
    oracle,
    stages: [identify, nature, identity],
    initial: () => ({ candidates, match: null, nature: '', identical: 0 }),
    onProgress: (done, total) => {
      asked = done
      reporter.progress('adjudicating', done, total)
    }
  })
  reporter.response('jev', `${asked} answered`)

  const verdicts = results.map(({ subject, context, band, confidence, error }): Verdict => {
    const base = {
      key: subject.key,
      source: subject.source,
      title: subject.title,
      url: subject.url
    }

    if (error) {
      // A question that was never answered is not a decision. Flagged, with
      // the reason, which is more useful than a run that got to 80% and threw
      // everything away.
      return {
        ...base,
        matchTrackId: '',
        matchTitle: '',
        nature: '',
        proposal: 'drop',
        probability: 0,
        flagged: true,
        reason: `Could not be adjudicated — ${error}`
      }
    }

    if (!context.match) {
      const kind = context.nature || 'recording'
      return {
        ...base,
        matchTrackId: '',
        matchTitle: '',
        nature: kind,
        proposal: kind === 'recording' ? 'exclusive' : 'drop',
        probability: confidence,
        /*
         * Flagged on anything short of confident, rather than only on the
         * middle band. A `choice` answered at 0.1 is the oracle picking an
         * option it does not believe in — which is a different thing from a
         * `noul` at 0.1, where the low number *is* the answer.
         */
        flagged: band !== 'yes',
        reason:
          kind === 'recording'
            ? 'Not in the released catalogue, and it is a piece of music.'
            : `Not in the released catalogue, and it reads as ${kind} rather than a recording.`
      }
    }

    const different = band === 'no'
    return {
      ...base,
      matchTrackId: different ? '' : context.match.id,
      matchTitle: context.match.title,
      nature: '',
      proposal: different ? 'exclusive' : 'merge',
      probability: confidence,
      flagged: band === 'unsure',
      reason: different
        ? `A different version of "${context.match.title}", so it gets its own record.`
        : `The same recording as "${context.match.title}", so it becomes a link on it.`
    }
  })

  const count = (name: string): number => verdicts.filter((v) => v.proposal === name).length
  reporter.note(
    'jev',
    `${count('merge')} same recording · ${count('exclusive')} its own record · ${count('drop')} not a record · ${verdicts.filter((v) => v.flagged).length} for you`
  )
  for (const verdict of verdicts.filter((v) => v.flagged).slice(0, 8)) {
    reporter.response('jev', `${verdict.probability.toFixed(2)} — "${verdict.title.slice(0, 60)}"`)
  }

  return { verdicts, warnings }
}
