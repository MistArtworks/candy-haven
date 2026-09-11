/**
 * Zod-free half of the tags domain — see projects.constants.ts for why the
 * split exists.
 */

/**
 * A TAG is an operator-made label: `140`, `Deep`, `Dark`.
 *
 * It is **metadata only**, like a VOLUME and unlike a FOLDER. No directory is
 * created for one and nothing moves on disk when a project gains or loses one,
 * which is the whole reason tags can do what the filing tree cannot: a project
 * lives in exactly one folder, and carries as many tags as it likes.
 *
 * That is the division of labour worth stating plainly. The tree answers
 * "where is this filed"; tags answer "what is this like". Trying to express
 * `Deep` *and* `Dark` *and* `140` in a folder hierarchy means either three
 * nested levels in an arbitrary order or the same project copied three times,
 * and the client already rejected a single extra mandatory level as needless
 * complexity. Tags are the flat answer to the same need.
 *
 * **Tags are global, with an advisory home shelf.** A tag records the folder it
 * was created under in `folderId`, and that is used for ordering the picker and
 * the filter row — a tag made under Dubstep surfaces first while browsing
 * Dubstep — but never for permission. Nothing refuses a Dubstep tag on a
 * Techno project, and nothing strips a project's tags when it is dragged to
 * another shelf. This mirrors `ArchiveVolume.folderId` exactly, and for the
 * same reason: a structural link here would mean a project's labels silently
 * going invalid as a side effect of filing it somewhere else, which is a
 * surprising amount of destruction to hang off a drag.
 */

export const MAX_TAG_NAME_LENGTH = 32

/**
 * The swatches offered when a tag is created, and the pool a random one is
 * drawn from.
 *
 * Eight rather than the folder palette's fifteen. A tag is chosen in passing —
 * mid-sentence, while typing a name — so the strip has to fit on one line
 * beside the create button without becoming a decision. The full fifteen, plus
 * the colour well and the hex field, are all still available afterwards from
 * the tag library dialog, which is where deliberate colour work belongs.
 *
 * Spread around the wheel on purpose. The point of a coloured chip is that a
 * row of eight can be told apart at a glance; eight shades of the house
 * crimson would carry no more than eight words do. This is the same licence
 * granted to folder swatches — see `SwatchPicker` for the argument.
 */
export const TAG_SWATCHES: readonly string[] = [
  '#b2453c',
  '#c07a2c',
  '#a8903f',
  '#6f8f5a',
  '#4f8a86',
  '#4a6f9c',
  '#7a5f9e',
  '#a5567c'
]

/**
 * A colour for a tag created without one chosen.
 *
 * Random rather than rotating. A cursor stepping through the palette gives a
 * pleasingly varied run when tags are made one after another, and the same
 * colour every time when they are made one per session — which is how they
 * are actually made. Random is worse in the first case and much better in the
 * second.
 */
export function randomTagColour(): string {
  return TAG_SWATCHES[Math.floor(Math.random() * TAG_SWATCHES.length)]
}

export interface TagNameVerdict {
  ok: boolean
  reason: string | null
}

/**
 * Checked in the picker before a round trip, and again in the service on the
 * way in — the renderer is not trusted to have asked.
 *
 * Loose, like `validateVolumeTitle` and unlike `validateFolderName`: a tag
 * never becomes a directory, so the filesystem's rules about colons, trailing
 * dots and reserved device names have no bearing on it. `140` is a perfectly
 * good tag, and so is `4/4`.
 *
 * The one real rule is the comma, which is reserved because tags are typed as
 * a comma-separated run in the picker — allowing one inside a name would make
 * `Deep, Dark` ambiguous between one tag and two.
 */
export function validateTagName(name: string): TagNameVerdict {
  const trimmed = name.trim()

  if (trimmed.length === 0) return { ok: false, reason: 'A tag needs a name.' }
  if (trimmed.length > MAX_TAG_NAME_LENGTH) {
    return { ok: false, reason: `Keep the name under ${MAX_TAG_NAME_LENGTH} characters.` }
  }
  if (trimmed.includes(',')) {
    return { ok: false, reason: 'Tag names cannot contain a comma.' }
  }

  return { ok: true, reason: null }
}

/**
 * The key two tag names are considered the same under.
 *
 * Case- and space-insensitive, so `Deep`, `deep` and `DEEP ` are one tag rather
 * than three that look identical in a chip row. The *stored* name keeps the
 * spelling the operator typed; this is only ever used for comparison.
 */
export function tagKey(name: string): string {
  return name.trim().toLowerCase()
}
