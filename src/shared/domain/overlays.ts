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
export const OVERLAY_IDS = ['selection', 'transmission', 'interval', 'convene', 'docket'] as const

export type OverlayId = (typeof OVERLAY_IDS)[number]

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
    id: 'selection',
    slug: 'selection',
    label: 'RESONANCE SELECTION',
    purpose: 'Weighted draw on a rotating ring — the field chooses one petition',
    epigraph: 'We do not question the shape of the universe.',
    order: 0,
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
    id: 'transmission',
    slug: 'transmission',
    label: 'NOW TRANSMITTING',
    purpose: 'Live Spotify playback: track, artist, cover plate and timeline',
    epigraph: 'Sound is not heard. It is structured. It is shaped.',
    order: 1,
    implemented: false,
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
    order: 2,
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
    order: 3,
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
    order: 4,
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
  const url = new URL(overlay.slug, base.endsWith('/') ? base : `${base}/`)
  if (options.transparent) url.searchParams.set('transparent', '1')
  if (options.guides) url.searchParams.set('guides', '1')
  return url.toString()
}
