/**
 * Decide what the deterministic rungs could not.
 *
 * Spotify, Apple, Deezer and TIDAL are joined by UPC or ISRC, so those links
 * are exact and nothing here touches them. SoundCloud and YouTube carry
 * neither identifier — only a title — and a title is where the hard cases
 * live:
 *
 *   YKWIL (Candy Heist Remix)   ↔  You Know What I Like (Candy Heist Remix)
 *   For The Record              ↔  For The Record - Radio Edit
 *
 * The first pair is one recording under two names. The second is two
 * recordings of one song. No amount of string normalising tells them apart,
 * and getting it wrong in either direction is destructive: merge the radio
 * edit and a record disappears; split the abbreviation and the catalogue
 * grows a duplicate.
 *
 * ## Two questions, both typed
 *
 *   1. `choice` — which known recording is this, or none of them?
 *   2. `noul`   — is it the identical recording rather than a different edit?
 *
 * Jev answers with a probability per option rather than prose, which is the
 * whole reason it is here: the confident ends of the distribution resolve
 * themselves and only the middle reaches the operator.
 *
 *   >= 0.85  taken as decided
 *   <= 0.15  taken as decided, the other way
 *   between  goes to the review stage, with the probability attached
 *
 * ## Give it the evidence, not just the titles
 *
 * The first run withheld the artists and the durations and asked the model to
 * compare two strings. Every merge came back in the middle band, correctly —
 * "Float - Candy Heist, V3K, Circle Tone" against a bare "FLOAT" is genuinely
 * undecidable until you can see that FLOAT's artists *are* V3K, Candy Heist
 * and Circle Tone. Uploads name collaborators in the title where stores name
 * them in a field, so both are now in the question.
 *
 * Nothing in this file writes to the archive. It annotates the cache.
 *
 * Run:  node scripts/seed/adjudicate.mjs
 */
import { cacheRead, cacheWrite, credentials, pool, request } from './lib.mjs'

const CERTAIN = 0.85
const REJECTED = 0.15
const NEWLINE = String.fromCharCode(10)

/**
 * The service, chosen by the shape of the key rather than by configuration.
 *
 * A TypeSafe key is `apikey_…` and speaks the typed-question API directly; an
 * OpenRouter key is `sk-or-…` and would need the answer coaxed out of a chat
 * completion. The direct route is better — the probabilities are the product
 * rather than something parsed back out of prose — so it is preferred
 * whenever the key allows it.
 */
function service(env) {
  const key = (env.JEV_API_KEY || '').trim()
  if (!key) return null
  if (key.startsWith('apikey_') || env.JEV_PROVIDER === 'typesafe') {
    return { url: 'https://api.typesafe.ai/v1/systemone', key, model: 'jev-latest' }
  }
  return null
}

async function ask(target, state, questions) {
  const payload = await request(target.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${target.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: target.model, state, questions })
  })
  return payload.answers ?? {}
}

/** `0.91` → decided, `0.4` → ask the operator. */
function band(probability) {
  if (probability >= CERTAIN) return 'yes'
  if (probability <= REJECTED) return 'no'
  return 'unsure'
}

function clock(ms) {
  const minutes = Math.floor(ms / 60000)
  const seconds = String(Math.round((ms % 60000) / 1000)).padStart(2, '0')
  return `${minutes}:${seconds}`
}

async function main() {
  const env = await credentials()
  const target = service(env)
  if (!target) throw new Error('JEV_API_KEY is empty, or is not a TypeSafe key.')

  const spotify = await cacheRead('spotify')
  const soundcloud = await cacheRead('soundcloud')
  const youtube = await cacheRead('youtube')
  if (!spotify) throw new Error('Run scripts/seed/spotify.mjs first.')

  /*
   * The candidates are his own recordings only.
   *
   * The 25-track compilation he is one song of would otherwise put two dozen
   * other people's tracks into every question — noise that makes the choice
   * harder for no gain, since an upload of his is never going to be somebody
   * else's compilation track.
   */
  const ownReleases = spotify.releases.filter((release) => release.tracks.length <= 10)
  const candidates = ownReleases.flatMap((release) =>
    release.tracks.map((track) => {
      const artists = track.artists.map((a) => a.name).join(', ')
      return {
        key: track.id,
        label: `"${track.title}" by ${artists} — from "${release.title}", ${release.releaseDate ?? '?'}, ${clock(track.durationMs)}`,
        title: track.title,
        artists,
        duration: clock(track.durationMs),
        release: release.title,
        releaseId: release.id,
        isrc: track.isrc
      }
    })
  )

  // Everything a title could not settle, from both fuzzy sources.
  const pending = [
    ...(soundcloud?.tracks ?? [])
      .filter((t) => t.found && t.verdict !== 'exact')
      .map((t) => ({ source: 'soundcloud', title: t.title, url: t.url, note: t.description ?? '' })),
    ...(youtube?.videos ?? [])
      .filter((v) => v.verdict !== 'exact')
      .map((v) => ({ source: 'youtube', title: v.title, url: v.url, note: `${v.channel} channel` }))
  ]

  console.log(`${NEWLINE}  ${pending.length} undecided · ${candidates.length} candidate recordings${NEWLINE}  `)

  const criteria = Object.fromEntries([
    ...candidates.map((c) => [c.key, c.label]),
    ['none', 'None of these — a recording the released catalogue does not contain.']
  ])

  const decided = await pool(pending, 3, async (item) => {
    const state = [
      `An upload by the artist Candy Heist, found on ${item.source}.`,
      `Title: "${item.title}"`,
      item.note ? `Context: ${item.note.slice(0, 200)}` : '',
      '',
      'His released catalogue is listed as the options, each with its artists,',
      'its record and its running time. Uploads are routinely titled with the',
      'collaborators written into the title where a store lists them as',
      'artists, and are routinely abbreviated — YKWIL for "You Know What I',
      'Like".'
    ]
      .filter(Boolean)
      .join(NEWLINE)

    const first = await ask(target, state, {
      which: {
        type: 'choice',
        instructions:
          'Which released recording is this upload, if any? Choose "none" when it is something the catalogue does not contain — a bootleg, a DJ or promo mix, a demo, a teaser clip, or a remix of another artist that was never released.',
        criteria
      }
    })

    const pick = first.which
    const chosen = candidates.find((c) => c.key === pick?.choice)
    const confidence = pick?.probabilities?.[pick?.choice] ?? 0

    if (!chosen) {
      /*
       * Not in the catalogue is not the same as "a record we should make".
       *
       * Most of what a musician puts on YouTube is *about* the music rather
       * than the music: teasers, studio clips, pre-save announcements, vlogs.
       * Seeding those as releases would fill the discography with things that
       * are not recordings at all, which is worse than missing an exclusive —
       * a missing record is one row to add, and twenty phantom ones have to be
       * found and deleted.
       *
       * So anything the catalogue does not contain is asked what it *is*, and
       * only an actual unreleased recording becomes a record.
       */
      const nature = await ask(
        target,
        [
          `A ${item.source} upload by Candy Heist that does not correspond to any released recording.`,
          `Title: "${item.title}"`,
          item.note ? `Context: ${item.note.slice(0, 200)}` : ''
        ]
          .filter(Boolean)
          .join(NEWLINE),
        {
          kind: {
            type: 'choice',
            instructions: 'What is this upload?',
            criteria: {
              recording:
                'A complete piece of music in its own right — an unreleased track, a bootleg, a remix, an edit. Something a discography entry could reasonably be made for.',
              promo:
                'Material about a track rather than the track: a teaser, a snippet, a studio or process clip, a pre-save or out-now announcement, a live-set clip, a meme or vertical short.',
              mix: 'A DJ mix, radio show or continuous set, rather than a single piece of music.',
              other: 'Not music at all — a vlog, an announcement, a life update, anything else.'
            }
          }
        }
      )

      const kind = nature.kind?.choice ?? 'recording'
      const certainty = nature.kind?.probabilities?.[kind] ?? 0
      process.stdout.write(kind === 'recording' ? 'x' : '·')

      return {
        ...item,
        verdict: kind === 'recording' ? 'exclusive' : 'discard',
        kind,
        confidence,
        certainty,
        band: band(certainty)
      }
    }

    /*
     * Named the same record — but is it the same *recording*?
     *
     * A radio edit and an extended mix are both legitimately "For The Record"
     * and neither is the other. Asked separately because the first question's
     * job is identification and this one's is identity, and folding them into
     * one choice would make the option list quadratic.
     */
    const second = await ask(
      target,
      [
        `A — released recording: "${chosen.title}" by ${chosen.artists}, from "${chosen.release}", running ${chosen.duration}.`,
        `B — ${item.source} upload: "${item.title}".`,
        item.note ? `    B is described as: ${item.note.slice(0, 200)}` : '',
        '',
        'A title that merely lists A’s artists, or abbreviates A’s name, is',
        'still A. A title marked radio edit, extended mix, VIP, sped up,',
        'slowed, live, or naming a different remixer is a different recording.'
      ]
        .filter(Boolean)
        .join(NEWLINE),
      {
        identical: {
          type: 'noul',
          instructions:
            'Is B the same recording as A, rather than a different version of the same song?',
          criteria: {
            true: 'The same master, however the title is written.',
            false: 'A different recording of the same song — a different edit, mix, or remix.'
          }
        }
      }
    )

    const identical = second.identical?.noul ?? 0
    process.stdout.write(band(identical) === 'unsure' ? '?' : '•')

    return {
      ...item,
      verdict: band(identical) === 'no' ? 'other-version' : 'same',
      match: {
        trackId: chosen.key,
        title: chosen.title,
        release: chosen.release,
        releaseId: chosen.releaseId,
        isrc: chosen.isrc
      },
      confidence,
      identical,
      band: band(identical)
    }
  })

  console.log(NEWLINE)
  await cacheWrite('adjudicated', {
    decidedAt: new Date().toISOString(),
    bands: { CERTAIN, REJECTED },
    items: decided
  })

  const group = (name) => decided.filter((d) => d.verdict === name)
  const unsure = decided.filter((d) => d.band === 'unsure')

  console.log('─'.repeat(78))
  console.log(`  same recording       ${group('same').length}   → merge, add the link`)
  console.log(`  different version    ${group('other-version').length}   → its own record`)
  console.log(`  unreleased recording ${group('exclusive').length}   → exclusive, new record`)
  console.log(`  promo / mix / other  ${group('discard').length}   → not a record, dropped`)
  console.log(`  needs your eye       ${unsure.length}`)
  console.log(`  cached to            .seed-cache/adjudicated.json`)
  console.log('─'.repeat(78))

  for (const [heading, rows] of [
    ['SAME RECORDING — merge', group('same')],
    ['DIFFERENT VERSION — own record', group('other-version')],
    ['UNRELEASED RECORDING — new record', group('exclusive')],
    ['NOT A RECORD — dropped', group('discard')]
  ]) {
    if (rows.length === 0) continue
    console.log(`${NEWLINE}  ${heading}${NEWLINE}`)
    for (const row of rows) {
      const title = row.title.length > 44 ? `${row.title.slice(0, 43)}…` : row.title
      const probability = row.identical ?? row.certainty ?? row.confidence
      console.log(
        `   ${row.source.padEnd(11)} ${title.padEnd(46)} ${(row.match ? row.match.title.slice(0, 22) : (row.kind ?? '')).padEnd(24)} ${probability.toFixed(2)}${row.band === 'unsure' ? '  ← check' : ''}`
      )
    }
  }
  console.log('')
}

main().catch((error) => {
  console.error(`${NEWLINE}  FAILED  ${error.message}${NEWLINE}`)
  process.exitCode = 1
})
