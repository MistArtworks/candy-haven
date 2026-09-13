/**
 * Synthetic audience, for rehearsing an overlay without one.
 *
 * Every overlay in the observatory is built to be filled by a crowd, which
 * makes the whole department impossible to exercise alone — the operator can
 * put a call and then look at an empty roll. This is where the crowd comes
 * from: names, ids and things they file.
 *
 * Shared by every simulator so the rehearsal has one voice. A muster seeded
 * from one word list and a ring seeded from another would look like two
 * different broadcasts, and the point of rehearsing is to see the thing you
 * are actually going to show.
 *
 * ## Distinct by construction, not by luck
 *
 * The entries are composed by *index* rather than drawn at random, and that is
 * load-bearing rather than tidy. The muster refuses an entry it already holds —
 * deliberately, because chat clients resend and people double-post — so a
 * simulator picking titles at random would have most of its filings silently
 * dropped and would look broken. Walking the grid guarantees the first
 * `ADJECTIVES.length × NOUNS.length` are all different.
 */

/** The first half of a title. */
const ADJECTIVES = [
  'OBSIDIAN',
  'CRIMSON',
  'HOLLOW',
  'RESONANT',
  'DERELICT',
  'GILDED',
  'SILENT',
  'FRACTURED',
  'DISTANT',
  'VESTIGIAL',
  'CONCRETE',
  'LOW'
] as const

/** The second. */
const NOUNS = [
  'TRANSIT',
  'CHORUS',
  'LATTICE',
  'PROCESSION',
  'MONOLITH',
  'CIRCUIT',
  'HARVEST',
  'SIGNAL',
  'VESSEL',
  'CHOIR',
  'ORBIT',
  'THRESHOLD'
] as const

/**
 * Handles for the synthetic citizens.
 *
 * Shorter than the titles and in a different register, so an overlay crediting
 * its filers does not read as one word list talking to itself.
 */
const HANDLES = [
  'vantablack',
  'null_pointer',
  'sub_bass_only',
  'kirrilla',
  'omunwatcher',
  'plate_reverb',
  'tenth_district',
  'sidechain',
  'greycard',
  'anechoic',
  'lowpass_lucy',
  'mistartworks'
] as const

/** How many different titles this can produce before it has to repeat. */
export const DISTINCT_ENTRIES = ADJECTIVES.length * NOUNS.length

/**
 * The `index`th title.
 *
 * Past `DISTINCT_ENTRIES` it wraps and appends a numeral rather than repeating
 * outright, so a caller asking for more than the grid holds still gets
 * something every consumer will accept.
 */
export function syntheticEntry(index: number): string {
  const position = index % DISTINCT_ENTRIES
  const lap = Math.floor(index / DISTINCT_ENTRIES)
  const title = `${ADJECTIVES[position % ADJECTIVES.length]} ${NOUNS[Math.floor(position / ADJECTIVES.length)]}`

  return lap === 0 ? title : `${title} ${'I'.repeat(Math.min(lap, 3))}`
}

/** A citizen, stable for a given index so the same one can file twice. */
export function syntheticCitizen(index: number): {
  userId: string
  login: string
  display: string
} {
  const handle = HANDLES[index % HANDLES.length]
  const lap = Math.floor(index / HANDLES.length)
  const login = lap === 0 ? handle : `${handle}${lap}`

  return {
    userId: `sim-${index}`,
    login,
    // Title case for display, as a platform would render it.
    display: login.replace(/(^|_)([a-z])/g, (_, lead: string, letter: string) => {
      return `${lead === '_' ? ' ' : ''}${letter.toUpperCase()}`
    })
  }
}
