/**
 * Canonical overlay registry.
 *
 * The same shape and the same discipline as the department registry in
 * navigation.ts: one declaration drives the console's catalogue, the sub-routes,
 * the overlay server's URL table and the renderer build's entry points. Adding
 * an overlay is one entry here plus its page.
 *
 * Deliberately free of zod, Node and DOM imports — this module is read by the
 * main process, the renderer, the standalone overlay pages *and*
 * electron.vite.config.ts, which builds one document per shipped overlay
 * straight off this table.
 */

/**
 * Only overlays that exist, plus a single placeholder for what is being built
 * next.
 *
 * The catalogue was carrying five reserved entries and it made the page hard to
 * read — the shipped kit was outnumbered by descriptions of things that were
 * not there. Keeping one placeholder preserves the point of the reserved state
 * (the shape of the next delivery is legible) without burying the working
 * overlays. Removed entries are three lines to reinstate.
 */
export const OVERLAY_IDS = [
  'muster',
  'selection',
  'concord',
  'transmission',
  'interval',
  'convene',
  'docket'
] as const

export type OverlayId = (typeof OVERLAY_IDS)[number]

/**
 * One browser-source address.
 *
 * An overlay always answers on its own slug, and may answer on further
 * addresses that each pin a different presentation of the *same* live state —
 * THE CONCORD serves a full scene at `/concord` and a corner widget at
 * `/concord-widget`, from one poll and one built document.
 *
 * Note which direction this runs, because the registry now expresses both:
 * `document` lets several catalogue *entries* share one page (the two
 * countdowns, which have separate state). `addresses` gives one entry several
 * *addresses*, so it adds no catalogue card and no console page — the operator
 * manages one poll and pastes two URLs.
 */
export interface OverlayAddress {
  /** URL segment, and the console's key for this address. */
  slug: string
  /** Uppercase institutional label. */
  label: string
  /** What this address is for, as opposed to what the overlay is. */
  purpose: string
  /** Recommended browser-source dimensions for this address specifically. */
  canvas: { width: number; height: number }
  /**
   * Configuration this address pins, interpreted by the overlay's own page.
   *
   * A plain string on purpose. This module is read by the main process, the
   * renderer, the standalone overlay pages *and* electron.vite.config.ts, so it
   * stays free of domain imports — the page that understands the value is the
   * page that validates it.
   */
  pin?: string
}

export interface OverlayDefinition {
  id: OverlayId
  /**
   * URL segment. Serves double duty: the console sub-route
   * (`/observatory/<slug>`) and the browser-source path on the overlay server
   * (`http://127.0.0.1:<port>/<slug>`). One string so the two can never drift.
   */
  slug: string
  /** Uppercase institutional label used in the catalogue. */
  label: string
  /** Plain description of what the overlay actually shows. */
  purpose: string
  /** Flavour line drawn from the world brief. */
  epigraph: string
  order: number
  /** False until the overlay ships; the catalogue lists it with its scope. */
  implemented: boolean
  /**
   * What this overlay will do. Shown on its catalogue entry while reserved, so
   * the shape of the finished broadcast kit is legible while it is being built.
   */
  scope: readonly string[]
  /** Recommended browser-source dimensions, quoted in the console. */
  canvas: { width: number; height: number }
  /**
   * Further addresses this overlay answers on, beyond its own slug.
   *
   * See `OverlayAddress`. Each one is served off the same document, so adding
   * one costs a registry entry and a line in the page that reads its pin.
   */
  addresses?: readonly OverlayAddress[]
  /**
   * Built document this overlay is served from, when it is not its own slug.
   *
   * Lets several catalogue entries share one page: the two countdowns are the
   * same overlay with separate state, so they have separate addresses and
   * separate console pages but one implementation and one build entry.
   */
  document?: string
  /**
   * Whether the overlay is meant to sit over a scene or occupy it.
   *
   * `full` overlays are their own scene — a rite, an interval card. `panel`
   * overlays are furniture composited alongside gameplay or a DAW capture, and
   * want `?transparent=1`.
   */
  form: 'full' | 'panel'
}

export const OVERLAYS: readonly OverlayDefinition[] = [
  {
    id: 'muster',
    slug: 'muster',
    label: 'THE MUSTER',
    purpose: 'An open call: chat files entries against a question, live on the scene',
    epigraph: 'Choices measured. Deviance erased.',
    order: 0,
    implemented: true,
    scope: [
      'Operator puts a question; chat files entries with a chat command',
      'The roll fills on the broadcast, numbered and credited to each citizen',
      'A settable clock runs the call down, or it stays open until closed',
      'One entry per citizen by default, and duplicates are refused',
      'The finished roll is handed to the ring, the chamber, or both'
    ],
    canvas: { width: 1920, height: 1080 },
    addresses: [
      {
        slug: 'muster-widget',
        label: 'THE MUSTER — WIDGET',
        purpose: 'Corner plate showing the question and the latest filings',
        canvas: { width: 460, height: 380 },
        pin: 'widget'
      }
    ],
    form: 'full'
  },
  {
    id: 'selection',
    slug: 'selection',
    label: 'RESONANCE SELECTION',
    purpose: 'Weighted draw on a rotating ring — the field chooses one petition',
    epigraph: 'We do not question the shape of the universe.',
    order: 1,
    implemented: true,
    scope: [
      'Operator files petitions; the ring previews them live on the broadcast',
      'One winner drawn in the main process before the animation begins',
      'Console and browser source animate the same spin in step',
      'Elimination mode withdraws the winner from the pool',
      'Chat-filed petitions, one entry per citizen'
    ],
    canvas: { width: 1920, height: 1080 },
    form: 'full'
  },
  {
    id: 'concord',
    slug: 'concord',
    label: 'THE CONCORD',
    purpose: 'Chat votes on a ballot; a deadlock is settled by casting lots',
    epigraph: 'Harmony decided for all, not by all.',
    order: 2,
    implemented: true,
    scope: [
      'Operator files a ballot; chat votes by typing the numeral',
      'One vote per citizen, changeable while the chamber sits',
      'Settable window, or open until the operator closes it',
      'A deadlock escalates to THE CASTING — equal lots, one is taken',
      'Console and browser source show the same tally and lift the same lot'
    ],
    canvas: { width: 640, height: 900 },
    /*
     * Two addresses, one poll.
     *
     * The point is running both at once: the full scene on whatever the audience
     * is watching, and the widget in the corner of the operator's working scene.
     * A single address with a layout setting could not express that, because
     * there is one setting and two sources — so the *address* is what pins the
     * layout, which also means the URL the console hands over is the whole
     * configuration for that source.
     */
    addresses: [
      {
        slug: 'concord-widget',
        label: 'THE CONCORD — WIDGET',
        purpose: 'Compact plate for a corner of a working scene',
        canvas: { width: 460, height: 320 },
        pin: 'widget'
      }
    ],
    form: 'panel'
  },
  {
    id: 'transmission',
    slug: 'transmission',
    label: 'NOW TRANSMITTING',
    purpose: 'Live Spotify playback: track, artist, cover plate and timeline',
    epigraph: 'Sound is not heard. It is structured. It is shaped.',
    order: 3,
    implemented: true,
    scope: [
      'Reads the operator’s current Spotify playback over the Web API',
      'Four presentations: plate, monolith, strip and disc',
      'Timeline interpolated locally between polls, so it moves smoothly',
      'Cover art inlined by the main process rather than fetched by the scene',
      'Hides itself when nothing is playing'
    ],
    canvas: { width: 900, height: 260 },
    form: 'panel'
  },
  {
    id: 'interval',
    slug: 'interval',
    label: 'INTERVAL',
    purpose: 'Multi-purpose countdown with a grace period, for breaks and segments',
    epigraph: 'Time itself is constructed, maintained, and policed.',
    order: 4,
    implemented: true,
    document: 'timer',
    scope: [
      'Settable duration with one-tap presets, started and paused from the console',
      'Grace period past zero, counted down in crimson rather than stopping',
      'Four countdown presentations the operator selects per timer',
      'Audio cues in the console at one minute and at final call',
      'Blinks on expiry; transparent throughout so it drops onto any scene'
    ],
    canvas: { width: 760, height: 440 },
    form: 'panel'
  },
  {
    id: 'convene',
    slug: 'convene',
    label: 'CONVENING',
    purpose: 'Stream-opening countdown that resolves to NOW',
    epigraph: 'A society built on order, where symmetry is worship.',
    order: 5,
    implemented: true,
    document: 'timer',
    scope: [
      'Counts the room in ahead of a broadcast',
      'Resolves to a single word rather than to a spent clock',
      'Silent by default — nothing warns an audience it is nearly time',
      'Shares the countdown presentations with the INTERVAL timer',
      'Its own duration and state, so both timers stay configured at once'
    ],
    canvas: { width: 900, height: 520 },
    form: 'panel'
  },
  {
    id: 'docket',
    slug: 'docket',
    label: 'THE DOCKET',
    purpose: 'Standing queue of chat requests and what is being worked next',
    epigraph: 'Mortals reduced to data; choices measured, deviance erased.',
    order: 6,
    implemented: false,
    scope: [
      'Numbered queue of requests, filed by the operator or by chat',
      'Marks the entry in progress and strikes those discharged',
      'Caps the queue and states the wait rather than growing without bound',
      'Credits each entry to whoever filed it',
      'Feeds finished entries into the ARCHIVE as project notes'
    ],
    canvas: { width: 520, height: 900 },
    form: 'panel'
  }
] as const

/*
 * The two declarations above have to agree, and nothing was checking that.
 *
 * `OVERLAY_IDS` drives the type while `OVERLAYS` drives every consumer, so an
 * id without an entry type-checks cleanly and then throws from `getOverlay` at
 * runtime — which is exactly what happened when a placeholder was removed from
 * one and left in the other. Asserted at module load so the mismatch surfaces
 * on the next launch rather than on the page that happens to ask for it.
 */
{
  const declared = new Set(OVERLAYS.map((overlay) => overlay.id))
  const missing = OVERLAY_IDS.filter((id) => !declared.has(id))
  if (missing.length > 0) {
    throw new Error(`Overlay ids declared without a definition: ${missing.join(', ')}`)
  }
}

export function getOverlay(id: OverlayId): OverlayDefinition {
  const overlay = OVERLAYS.find((entry) => entry.id === id)
  if (!overlay) throw new Error(`Unknown overlay: ${id}`)
  return overlay
}

export function getOverlayBySlug(slug: string): OverlayDefinition | undefined {
  return OVERLAYS.find((entry) => entry.slug === slug)
}

/**
 * Every address an overlay answers on, its own slug first.
 *
 * The primary address is synthesised from the definition rather than declared,
 * so a consumer can treat all of an overlay's addresses uniformly instead of
 * special-casing the first one.
 */
export function overlayAddresses(overlay: OverlayDefinition): readonly OverlayAddress[] {
  return [
    { slug: overlay.slug, label: overlay.label, purpose: overlay.purpose, canvas: overlay.canvas },
    ...(overlay.addresses ?? [])
  ]
}

/**
 * The overlay and address a URL segment resolves to.
 *
 * Used by the overlay server to serve a document, and by an overlay page to
 * discover which of its addresses it was loaded at. Matches an overlay's own
 * slug as well as its extra addresses, so `/concord` and `/concord-widget` both
 * resolve to the concord document.
 */
export function resolveOverlayAddress(
  slug: string
): { overlay: OverlayDefinition; address: OverlayAddress } | undefined {
  for (const overlay of OVERLAYS) {
    const address = overlayAddresses(overlay).find((entry) => entry.slug === slug)
    if (address) return { overlay, address }
  }
  return undefined
}

/** Every live address across the catalogue, for the server's directory page. */
export function liveOverlayAddresses(): readonly OverlayAddress[] {
  return LIVE_OVERLAYS.flatMap((overlay) => overlayAddresses(overlay))
}

/** The document an overlay is served from. Defaults to its own slug. */
export function overlayDocument(overlay: OverlayDefinition): string {
  return overlay.document ?? overlay.slug
}

/**
 * Distinct documents that need building, deduped.
 *
 * Read by electron.vite.config.ts: several catalogue entries can share one
 * page, and asking Vite for the same input twice is an error.
 */
export function liveOverlayDocuments(): string[] {
  return [...new Set(LIVE_OVERLAYS.map(overlayDocument))]
}

/** Overlays that have shipped, in catalogue order. */
export const LIVE_OVERLAYS: readonly OverlayDefinition[] = OVERLAYS.filter(
  (overlay) => overlay.implemented
)

/**
 * Browser-source address for an overlay.
 *
 * `base` is the server root reported by `overlay:info`, so the port stays in one
 * place even when it has been claimed upward from the configured one.
 */
export function overlaySourceUrl(
  base: string,
  overlay: OverlayDefinition,
  options: { transparent?: boolean; guides?: boolean } = {}
): string {
  return overlayAddressUrl(base, overlay.slug, options)
}

/** As `overlaySourceUrl`, for an overlay's non-primary addresses. */
export function overlayAddressUrl(
  base: string,
  slug: string,
  options: { transparent?: boolean; guides?: boolean } = {}
): string {
  const url = new URL(slug, base.endsWith('/') ? base : `${base}/`)
  if (options.transparent) url.searchParams.set('transparent', '1')
  if (options.guides) url.searchParams.set('guides', '1')
  return url.toString()
}
