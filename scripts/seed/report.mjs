/**
 * Assemble everything the harvest learned into one reviewable proposal.
 *
 * Reads only the cache — no network, no writes. Run it as often as you like
 * while deciding what the seeder should do.
 *
 * ## What it resolves that no single source can
 *
 * An exclusive is often on *two* fuzzy sources. `Over The Moon` is a
 * SoundCloud upload and a YouTube "Anime Music Video" of the same recording;
 * left alone that is two records for one song. Exclusives are therefore
 * grouped across sources by normalised title before anything is proposed —
 * the same rule the rest of the pipeline follows, one step later: **a record
 * is a recording, not an upload.**
 *
 * Run:  node scripts/seed/report.mjs
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CACHE, cacheRead } from './lib.mjs'

const NEWLINE = String.fromCharCode(10)

/**
 * A title reduced to the song, for grouping one recording's uploads together.
 *
 * Three things are stripped, and each was found in the real data:
 *
 *   - **Bracketed suffixes** — `[Anime Music Video]`, `(Visualiser)`. An
 *     anime music video *is* the official video for its track, so it belongs
 *     to that recording's record rather than to one of its own.
 *   - **Format words** left over once the brackets are gone.
 *   - **The artist's own name**, which SoundCloud leaves off and YouTube puts
 *     in front: `Over The Moon` and `Candy Heist - Over The Moon (Anime Music
 *     Video)` are one recording, and keeping the prefix made them two records
 *     for one song.
 *
 * Deliberately more aggressive than the matcher's normaliser, which must not
 * strip `(Radio Edit)`. Here both sides are already known *not* to be in the
 * released catalogue, so the trade is different: folding two uploads of one
 * unreleased track together is right, and the worst case is a record the
 * operator splits in review.
 */
function normalise(title, artist = '') {
  const name = artist.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  let text = (title || '')
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\b(official|anime|music|video|visualiser|visualizer|audio|lyric)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  if (name && text.startsWith(name + ' ')) text = text.slice(name.length + 1)
  if (name && text.endsWith(' ' + name)) text = text.slice(0, -(name.length + 1))
  return text.trim()
}

function clock(ms) {
  return `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`
}

async function main() {
  const spotify = await cacheRead('spotify')
  const expanded = await cacheRead('expanded')
  const tidal = await cacheRead('tidal')
  const soundcloud = await cacheRead('soundcloud')
  const youtube = await cacheRead('youtube')
  const adjudicated = await cacheRead('adjudicated')
  if (!spotify) throw new Error('Run scripts/seed/spotify.mjs first.')

  const decisions = adjudicated?.items ?? []
  const lines = []
  const say = (text = '') => lines.push(text)

  // ------------------------------------------------------ released records
  const compilations = spotify.releases.filter((r) => r.tracks.length > 10)
  const records = spotify.releases.filter((r) => r.tracks.length <= 10)

  say('# Discography seed — proposal')
  say('')
  say(`Harvested ${spotify.fetchedAt?.slice(0, 10)}. Nothing here has been written.`)
  say('')
  say('## 1 · Released records')
  say('')
  say('Every one of these is confirmed by identifier — UPC for the product, ISRC')
  say('for each recording — so the platform links are exact, not guesses.')
  say('')
  say('| # | Record | Kind | Date | Tracks | Spotify | Apple | Deezer | TIDAL | YouTube | SoundCloud |')
  say('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')

  const linksFor = (release) => {
    const apple = expanded?.apple?.[release.id]?.found ? '●' : '·'
    const dz = release.tracks.filter((t) => expanded?.deezer?.[t.id]?.found).length
    const td = release.tracks.filter((t) => tidal?.tracks?.[t.id]?.found).length
    const ytExact = (youtube?.videos ?? []).filter(
      (v) => v.verdict === 'exact' && release.tracks.some((t) => t.title === v.match?.title)
    ).length
    const scExact = (soundcloud?.tracks ?? []).filter(
      (t) => t.verdict === 'exact' && release.tracks.some((x) => x.title === t.match?.title)
    ).length
    const merged = decisions.filter(
      (d) => d.verdict === 'same' && d.match?.releaseId === release.id
    )
    return {
      apple,
      dz: `${dz}/${release.tracks.length}`,
      td: `${td}/${release.tracks.length}`,
      yt: ytExact + merged.filter((m) => m.source === 'youtube').length,
      sc: scExact + merged.filter((m) => m.source === 'soundcloud').length
    }
  }

  records
    .sort((a, b) => (a.releaseDate ?? '').localeCompare(b.releaseDate ?? ''))
    .forEach((release, index) => {
      const l = linksFor(release)
      // Spotify types anything short as a single; the app's own ceiling would
      // refuse a "single" holding three tracks, so the kind is proposed from
      // the tracklist and the operator can correct it.
      const kind = release.tracks.length > 1 ? 'EP' : 'single'
      say(
        `| ${String(index + 1).padStart(2, '0')} | ${release.title} | ${kind} | ${release.releaseDate ?? '?'} | ${release.tracks.length} | ● | ${l.apple} | ${l.dz} | ${l.td} | ${l.yt || '·'} | ${l.sc || '·'} |`
      )
    })

  say('')
  say('`●` present · `·` absent · `n/m` recordings matched of the record\'s total.')
  say('')
  say('**Kind is proposed, not read.** Spotify types every short record as a')
  say('`single`, including the four that carry two to four tracks. The app')
  say('refuses a single holding more than one track, so anything with a')
  say('tracklist is proposed as an EP for you to confirm.')

  // --------------------------------------------------------- compilations
  if (compilations.length > 0) {
    say('')
    say('## 2 · Compilations he appears on')
    say('')
    say('Seeded as **his track only**, per your decision — not the other artists,')
    say('and not their tracks.')
    say('')
    for (const release of compilations) {
      const his = release.tracks.filter((t) =>
        t.artists.some((a) => a.id === spotify.artist.id)
      )
      say(`- **${release.title}** (${release.tracks.length} tracks, ${release.releaseDate ?? '?'})`)
      for (const track of his) say(`  - takes \`${track.title}\` — ${clock(track.durationMs)} · ${track.isrc}`)
      if (his.length === 0) say('  - *no track credits him directly; needs a look*')
    }
  }

  // ------------------------------------------------------------- exclusives
  const exclusives = decisions.filter((d) => d.verdict === 'exclusive')
  const grouped = new Map()
  for (const item of exclusives) {
    const key = normalise(item.title, spotify.artist.name)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(item)
  }

  say('')
  say('## 3 · Exclusives — not on the stores')
  say('')
  say('Grouped across sources: an upload on SoundCloud *and* YouTube is one')
  say('recording and becomes one record with two links.')
  say('')
  say('| Recording | Sources | Confidence | Note |')
  say('| --- | --- | --- | --- |')
  for (const [, items] of grouped) {
    const sources = [...new Set(items.map((i) => i.source))].join(' + ')
    const lowest = Math.min(...items.map((i) => i.certainty ?? 0))
    const flag = items.some((i) => i.band === 'unsure') ? 'check this one' : ''
    say(`| ${items[0].title} | ${sources} | ${lowest.toFixed(2)} | ${flag} |`)
  }

  // -------------------------------------------------------------- merges
  const merges = decisions.filter((d) => d.verdict === 'same')
  say('')
  say('## 4 · Links to add to existing records')
  say('')
  say('| Upload | Source | Becomes a link on | Probability |')
  say('| --- | --- | --- | --- |')
  for (const merge of merges) {
    say(`| ${merge.title} | ${merge.source} | ${merge.match.title} | ${merge.identical.toFixed(2)}${merge.band === 'unsure' ? ' — confirm' : ''} |`)
  }

  // -------------------------------------------------------------- dropped
  const dropped = decisions.filter((d) => d.verdict === 'discard')
  say('')
  say('## 5 · Dropped — not records')
  say('')
  say('Promos, teasers, DJ mixes and anything that is not a piece of music.')
  say('')
  for (const item of dropped) {
    say(`- \`${item.kind}\` ${item.title}${item.band === 'unsure' ? '  *(unsure — check)*' : ''}`)
  }

  // --------------------------------------------------------------- totals
  const unsure = decisions.filter((d) => d.band === 'unsure').length
  say('')
  say('## 6 · What pressing the button would do')
  say('')
  say(`- **${records.length}** released records, with ${records.reduce((n, r) => n + r.tracks.length, 0)} recordings`)
  say(`- **${compilations.length}** compilation appearance${compilations.length === 1 ? '' : 's'}, his track only`)
  say(`- **${grouped.size}** exclusive record${grouped.size === 1 ? '' : 's'} from ${exclusives.length} uploads`)
  say(`- **${merges.length}** links added to records that already exist`)
  say(`- **${dropped.length}** uploads dropped as promo, mix or other`)
  say(`- **${unsure}** decisions flagged for your eye before anything is written`)
  say('')
  say('Amazon Music has no route and will be left empty on every record.')

  const path = join(CACHE, 'report.md')
  await writeFile(path, lines.join(NEWLINE) + NEWLINE, 'utf8')

  console.log(lines.join(NEWLINE))
  console.log(`${NEWLINE}  written to .seed-cache/report.md${NEWLINE}`)
}

main().catch((error) => {
  console.error(`${NEWLINE}  FAILED  ${error.message}${NEWLINE}`)
  process.exitCode = 1
})
