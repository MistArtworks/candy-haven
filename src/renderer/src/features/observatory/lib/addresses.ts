import type { OverlayDefinition } from '@shared/domain/overlays'
import { overlayAddressUrl, overlayAddresses } from '@shared/domain/overlays'

export interface AddressRow {
  /** Unique across the whole deck, so one copier can key every row. */
  key: string
  label: string
  /** What this address is for, as against what the overlay is. */
  purpose: string
  canvas: { width: number; height: number }
  url: string
}

export interface AddressOptions {
  /** Appends `?guides=1`, which draws each overlay's safe area. */
  guides?: boolean
}

/**
 * Overlays whose address pins transparency on, because nothing else can.
 *
 * ## Why this is a table and not `form === 'panel'`
 *
 * Deriving it from `form` was the first attempt and it is wrong, in a way
 * worth recording because it looks right.
 *
 * `?transparent=1` is a **force-on override**, not a setting: the browser
 * sources read it as `forceTransparent` and OR it with the overlay's own
 * stored `config.transparent` — see `overlays/selection/main.ts` and
 * `overlays/concord/main.ts`. It can turn transparency on and can never turn
 * it off. THE CONCORD, RESONANCE SELECTION and THE MUSTER each expose that
 * setting on their own page, so putting the flag on every `panel` overlay's
 * address would quietly override an operator who had deliberately asked for
 * the backdrop, with no way to tell from the URL that it had happened.
 *
 * The overlays that legitimately pin it are the ones with no setting to
 * override, where the address *is* the whole configuration. That is THE
 * ENCLOSURE, which already pins it on its own page for the reason recorded
 * there: a frame that is not transparent is not a frame.
 *
 * The rest are handed the same address their own page hands over, so one
 * overlay has one address wherever it was copied from.
 */
const PINS_TRANSPARENT: ReadonlySet<string> = new Set(['enclosure'])

/**
 * Every address one overlay answers on, ready to paste into OBS.
 *
 * Guides are the opposite kind of thing from the flag above and are handled
 * the opposite way — opt-in, global, and not remembered: they are wanted on
 * every source at once while a scene is being cut, and actively wrong on air.
 */
export function addressRowsFor(
  overlay: OverlayDefinition,
  base: string | null,
  options: AddressOptions = {}
): AddressRow[] {
  // No server, no address. And a reserved overlay has no address either — the
  // server does not route one, so printing a plausible URL for it would hand
  // the operator something that 404s.
  if (!base || !overlay.implemented) return []

  const transparent = PINS_TRANSPARENT.has(overlay.id)

  return overlayAddresses(overlay).map((address) => ({
    key: `${overlay.id}:${address.slug}`,
    label: address.label,
    purpose: address.purpose,
    canvas: address.canvas,
    url: overlayAddressUrl(base, address.slug, { transparent, guides: options.guides })
  }))
}

/**
 * Every live address in the kit, as one pasteable block.
 *
 * Setting up a scene collection from scratch means adding nine browser sources,
 * and copying nine addresses one at a time — switching windows between each —
 * is the tedious half of an evening's work. Labelled rather than bare so the
 * block is still legible once it is in a notes file, which is where it will
 * end up.
 */
export function addressManifest(rows: readonly AddressRow[]): string {
  return rows
    .map((row) => `${row.label}\t${row.canvas.width}x${row.canvas.height}\t${row.url}`)
    .join('\n')
}
