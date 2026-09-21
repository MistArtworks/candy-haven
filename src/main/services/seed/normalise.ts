/**
 * Two title normalisers, and the reason there are two.
 *
 * Both reduce a title to something comparable. They disagree deliberately
 * about bracketed suffixes, and that disagreement is the most load-bearing
 * decision in the matcher.
 */

/**
 * The matcher's normaliser. Case, punctuation and spacing only.
 *
 * Deliberately **not** stripping bracketed suffixes: `(Radio Edit)`,
 * `(Sped Up)` and `(Candy Heist Remix)` are the difference between one
 * recording and another, and a normaliser that threw them away would merge
 * records that must not be merged. Anything this does not settle is meant to
 * reach the adjudicator, not a cleverer regular expression.
 */
export function titleKey(title: string): string {
  return (title || '')
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * A title reduced to the *song*, for grouping one recording's uploads together.
 *
 * Three things are stripped, and each was found in the real data:
 *
 *   - **Bracketed suffixes** — `[Anime Music Video]`, `(Visualiser)`. An anime
 *     music video *is* the official video for its track, so it belongs to that
 *     recording's record rather than to one of its own.
 *   - **Format words** left over once the brackets are gone.
 *   - **The artist's own name**, which SoundCloud leaves off and YouTube puts
 *     in front: `Over The Moon` and `Candy Heist - Over The Moon (Anime Music
 *     Video)` are one recording, and keeping the prefix made them two records
 *     for one song.
 *
 * Far more aggressive than `titleKey`, and only ever applied to titles already
 * known *not* to be in the released catalogue. There the trade is different:
 * folding two uploads of one unreleased track together is right, and the worst
 * case is a record the operator splits in review.
 */
export function songKey(title: string, artist = ''): string {
  const name = titleKey(artist)
  let text = (title || '')
    .toLowerCase()
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\b(official|anime|music|video|visualiser|visualizer|audio|lyric)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  if (name && text.startsWith(`${name} `)) text = text.slice(name.length + 1)
  if (name && text.endsWith(` ${name}`)) text = text.slice(0, -(name.length + 1))
  return text.trim()
}

/** `3:42`, for a duration the operator is going to read rather than compute on. */
export function clock(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const seconds = String(Math.round((ms % 60000) / 1000)).padStart(2, '0')
  return `${minutes}:${seconds}`
}

/**
 * `https://open.spotify.com/artist/<id>?si=…` → `<id>`. Bare ids pass through.
 *
 * An artist is keyed by **id**, never by name. Searching for "Candy Heist"
 * returns a second, unrelated act with the same name, and one of their records
 * had already turned up on his YouTube channel's Releases tab.
 */
export function spotifyArtistId(value: string): string {
  const trimmed = (value || '').trim()
  if (!trimmed) return ''
  const match = /artist[/:]([A-Za-z0-9]+)/.exec(trimmed)
  return match ? match[1] : trimmed
}
