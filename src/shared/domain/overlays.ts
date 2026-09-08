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

export const OVERLAY_IDS = [
  'selection',
  'attrition',
  'transmission',
  'docket',
  'directive',
  'interval'
] as const

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
    id: 'attrition',
    slug: 'attrition',
    label: 'RITE OF ATTRITION',
    purpose: 'Selection by elimination — records are redacted until one remains',
    epigraph: 'The greatest weapon in society is forgetting.',
    order: 1,
    implemented: false,
    scope: [
      'Reads the same petition roster as the RESONANCE SELECTION',
      'Strikes through and redacts one record at a time, at accelerating tempo',
      'The last surviving record is the selection',
      'Per-elimination beats, so the chat reacts throughout rather than once',
      'Handles a pool far larger than a ring can legibly hold'
    ],
    canvas: { width: 1920, height: 1080 },
    form: 'full'
  },
  {
    id: 'transmission',
    slug: 'transmission',
    label: 'NOW TRANSMITTING',
    purpose: 'The track currently open: title, tempo, key and artwork',
    epigraph: 'Sound is not heard. It is structured. It is shaped.',
    order: 2,
    implemented: false,
    scope: [
      'Reads the live project from the ARCHIVE registry rather than manual entry',
      'Shows title, tempo, musical key and time signature as read from the .als',
      'Renders the selected cover art as the plate',
      'Follows the operator opening a different set, with no console interaction',
      'Collapses to a name-only strip when no analysis is available'
    ],
    canvas: { width: 900, height: 240 },
    form: 'panel'
  },
  {
    id: 'docket',
    slug: 'docket',
    label: 'THE DOCKET',
    purpose: 'Standing queue of chat requests and what is being worked next',
    epigraph: 'Mortals reduced to data; choices measured, deviance erased.',
    order: 3,
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
  },
  {
    id: 'directive',
    slug: 'directive',
    label: 'STANDING DIRECTIVE',
    purpose: 'Objectives for the session and progress against them',
    epigraph: 'Harmony is maintained.',
    order: 4,
    implemented: false,
    scope: [
      'Operator declares the session objectives before going live',
      'Each objective is sanctioned as it completes, on stream',
      'Progress meter reads real completion, not a timer',
      'Carries a session number and elapsed time as institutional chrome',
      'Records the session against the ARCHIVE when it closes'
    ],
    canvas: { width: 520, height: 620 },
    form: 'panel'
  },
  {
    id: 'interval',
    slug: 'interval',
    label: 'INTERVAL',
    purpose: 'Starting soon, standing by and closing cards with a countdown',
    epigraph: 'A machine of peace that erased its own history.',
    order: 5,
    implemented: false,
    scope: [
      'Three states: convening, in recess, and concluded',
      'Countdown to the declared start, driven by a real clock',
      'Holds the focal orb as the single object in an otherwise empty field',
      'Switched from the console without touching OBS',
      'Optionally lists what the session intends to cover'
    ],
    canvas: { width: 1920, height: 1080 },
    form: 'full'
  }
] as const

export function getOverlay(id: OverlayId): OverlayDefinition {
  const overlay = OVERLAYS.find((entry) => entry.id === id)
  if (!overlay) throw new Error(`Unknown overlay: ${id}`)
  return overlay
}

export function getOverlayBySlug(slug: string): OverlayDefinition | undefined {
  return OVERLAYS.find((entry) => entry.slug === slug)
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
