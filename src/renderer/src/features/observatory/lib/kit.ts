import type { OverlayDefinition, OverlayFamily, OverlayId } from '@shared/domain/overlays'
import { OVERLAYS, OVERLAY_FAMILIES } from '@shared/domain/overlays'
import type { OverlayMarkName } from '../components/icons/OverlayMark'

/**
 * The broadcast kit as the console presents it, which is not quite what the
 * registry declares.
 *
 * Two differences, and both are the reason this module exists rather than the
 * board reading `OVERLAYS` directly.
 *
 * **THE CHORUS is in the kit and not in the registry.** Every member of
 * `OVERLAYS` is a document the Vite build emits and the overlay server routes —
 * that table drives both. The chorus is code pasted into Streamlabs, so
 * declaring it there would ask the build for a document that does not exist
 * (see the note on its route in `router.tsx`). But from the operator's side it
 * is plainly part of the same kit, so it is added here, once, in the only layer
 * that is purely presentational.
 *
 * **The board is numbered by family, the registry by declaration.** Grouping
 * the board is itself explanatory — knowing THE GATE is a *standing scene* and
 * THE ENCLOSURE is *furniture* tells you how each is placed in OBS before a
 * word of description is read. But numbering by `overlay.order` inside those
 * groups would print `04 · 07` under CLOCKS, which reads as a page with
 * something missing from it.
 *
 * So numbering lives here and nowhere else. **`overlay.order` is declaration
 * order and is not displayed** — every index an operator sees, on the board and
 * in each overlay page's masthead, comes from `kitIndex()`. One authority, so
 * the board and the page it navigates to cannot disagree about what number an
 * overlay is.
 */

/** An overlay id, or THE CHORUS — which is in the kit but not the registry. */
export type KitId = OverlayId | 'chorus'

export interface KitEntry {
  id: KitId
  label: string
  /** The kind chip: `OPEN CALL`, `CHAT VOTE`. */
  role: string
  /** What it shows, in one plain sentence. No world vocabulary. */
  purpose: string
  /** How it runs, in three plain steps. Empty for a reserved overlay. */
  how: readonly string[]
  /** Flavour from the world brief. Drawn faint, beneath the plain line. */
  epigraph: string
  /**
   * Board position, 1-based. The only index the operator is shown.
   *
   * A number rather than a padded string because `PageHeader` takes a number
   * and pads it through `formatIndex`; the board pads it itself. Storing the
   * padded form would mean parsing it back in nine mastheads.
   */
  position: number
  mark: OverlayMarkName
  /** Route into this overlay's own console page. */
  route: string
  /**
   * The registry entry, or null for THE CHORUS.
   *
   * Null is what callers branch on for the things only a served overlay has:
   * addresses, a canvas, a form, live state. It is not a missing value.
   */
  overlay: OverlayDefinition | null
  implemented: boolean
}

export interface KitGroup {
  /** Stable key. `reserved` is not an `OverlayFamily`; see below. */
  id: OverlayFamily | 'reserved'
  label: string
  entries: readonly KitEntry[]
}

/**
 * THE CHORUS, described the same way the registry describes its own members.
 *
 * Here rather than in `OVERLAYS` for the reason above. It carries no canvas and
 * no form because it has no address — Streamlabs hosts it — which is exactly
 * the distinction `overlay: null` expresses to every consumer.
 */
const CHORUS: KitEntry = {
  id: 'chorus',
  label: 'THE CHORUS',
  role: 'CHAT FEED',
  purpose: 'Chat messages as a numbered list. Pasted into Streamlabs, not served here.',
  how: [
    'Set how it looks on this page',
    'Copy the CSS and the HTML it generates',
    'Paste both into the Streamlabs chat widget'
  ],
  epigraph: 'The core remembers what the people have forgotten.',
  // Filled in by the numbering pass below, which is the only thing allowed to
  // decide a position.
  position: 0,
  mark: 'chorus',
  route: '/observatory/chorus',
  overlay: null,
  implemented: true
}

const MARKS: Record<OverlayId, OverlayMarkName> = {
  muster: 'muster',
  selection: 'selection',
  concord: 'concord',
  transmission: 'transmission',
  interval: 'interval',
  convene: 'convene',
  enclosure: 'enclosure',
  gate: 'gate',
  survey: 'survey',
  docket: 'docket'
}

function fromRegistry(overlay: OverlayDefinition): KitEntry {
  return {
    id: overlay.id,
    label: overlay.label,
    role: overlay.role,
    purpose: overlay.purpose,
    how: overlay.how,
    epigraph: overlay.epigraph,
    position: 0,
    mark: MARKS[overlay.id],
    route: `/observatory/${overlay.slug}`,
    overlay,
    implemented: overlay.implemented
  }
}

/*
 * Board order, built once.
 *
 * Reserved entries are pulled out ahead of the family pass and grouped last,
 * so `family` stays a statement about what an overlay *is* rather than about
 * whether it exists yet. THE DOCKET is a chat instrument; it is also not built,
 * and those are two separate facts.
 */
const GROUPS: KitGroup[] = (() => {
  const shipped = OVERLAYS.filter((overlay) => overlay.implemented)
  const reserved = OVERLAYS.filter((overlay) => !overlay.implemented)

  const groups: KitGroup[] = OVERLAY_FAMILIES.map((family) => {
    const entries = shipped.filter((overlay) => overlay.family === family.id).map(fromRegistry)
    // The chorus is furniture: it dresses a working scene rather than
    // occupying one.
    if (family.id === 'furniture') entries.push(CHORUS)
    return { id: family.id, label: family.label, entries }
  }).filter((group) => group.entries.length > 0)

  if (reserved.length > 0) {
    groups.push({ id: 'reserved', label: 'RESERVED', entries: reserved.map(fromRegistry) })
  }

  return groups
})()

/*
 * The numbering pass.
 *
 * Runs across the flattened board rather than within each group, so the kit
 * reads as one numbered sequence broken into sections — the way every other
 * numbered thing in this console does.
 */
const FLAT: KitEntry[] = GROUPS.flatMap((group) => group.entries)
FLAT.forEach((entry, offset) => {
  entry.position = offset + 1
})

export const KIT_GROUPS: readonly KitGroup[] = GROUPS
export const KIT_ENTRIES: readonly KitEntry[] = FLAT

const BY_ID = new Map<KitId, KitEntry>(FLAT.map((entry) => [entry.id, entry]))

export function kitEntry(id: KitId): KitEntry {
  const entry = BY_ID.get(id)
  if (!entry) throw new Error(`Not in the broadcast kit: ${id}`)
  return entry
}

/**
 * The number an operator is shown for an overlay, on the board and on its page.
 *
 * Read by every overlay page's masthead. `overlay.order + 1` used to be read
 * there instead, which was correct only while the board listed the registry in
 * declaration order.
 */
export function kitNumber(id: KitId): number {
  return kitEntry(id).position
}

/** As `kitNumber`, padded for the board's own rows. */
export function kitIndex(id: KitId): string {
  return String(kitNumber(id)).padStart(2, '0')
}
