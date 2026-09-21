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
  'enclosure',
  'gate',
  'survey',
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

/**
 * Which group of the kit an overlay belongs to.
 *
 * The board groups by this, and the grouping is itself part of the answer to
 * "what does this do" — knowing THE GATE is a *standing scene* and THE
 * ENCLOSURE is *furniture* says how each is placed in OBS before a word of
 * description is read. Reserved entries are grouped by `!implemented` instead,
 * so a family here is what an overlay *is* rather than whether it exists.
 */
export type OverlayFamily = 'instrument' | 'clock' | 'scene' | 'furniture'

export const OVERLAY_FAMILIES: readonly { id: OverlayFamily; label: string }[] = [
  { id: 'instrument', label: 'CHAT INSTRUMENTS' },
  { id: 'clock', label: 'CLOCKS' },
  { id: 'scene', label: 'STANDING SCENES' },
  { id: 'furniture', label: 'FURNITURE' }
]

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
  /**
   * What kind of thing this is, in two or three words: `OPEN CALL`, `CHAT VOTE`.
   *
   * Drawn as a chip beside the label on the board and in the page masthead. It
   * is the shortest true answer to "what is this", and it is deliberately not
   * in the world's vocabulary — `THE CONCORD` already says the institutional
   * thing, and saying it twice tells an operator nothing they can act on.
   */
  role: string
  family: OverlayFamily
  /**
   * What the overlay actually shows, in one plain sentence.
   *
   * **Plain means plain.** No `petition`, `citizen`, `chamber`, `rite` or
   * `roll` — those are what the broadcast says, and the console's job is to be
   * operable rather than in character. The flavour is carried by `epigraph`,
   * which is drawn faint and beneath this rather than in place of it: the desk
   * used to lead each card with the epigraph, so the page announced its mood
   * before it said what anything was for.
   */
  purpose: string
  /**
   * How it runs, in three plain steps.
   *
   * A sentence can say what an overlay *is*; only steps say how it is *used*,
   * and "how is this used" is the question somebody has when they are looking
   * at eleven of them. Three is the budget on purpose — the full procedure is
   * CATECHISM's job, and a block long enough to need scrolling would be back to
   * the wall of prose this replaced.
   */
  how: readonly string[]
  /**
   * Caption for the overlay's *primary* address, where it differs.
   *
   * `overlayAddresses` synthesises the primary row rather than declaring it, and
   * it used to caption that row with `purpose` — a description of the whole
   * overlay standing in for a description of one of its addresses. That reads
   * as a mistake beside an extra address that describes itself properly
   * (`Corner plate showing the question and the latest filings`). Optional, so
   * a single-address overlay need not repeat itself.
   */
  sourcePurpose?: string
  /** Flavour line drawn from the world brief. */
  epigraph: string
  /**
   * Declaration order. **Not the number the operator is shown.**
   *
   * The console's board groups the kit by `family` and numbers it across those
   * groups, so that numbering cannot come from here — and it also has to make
   * room for THE CHORUS, which is in the kit and deliberately not in this
   * registry. `lib/kit.ts` owns every index an operator sees, on the board and
   * in each overlay page's masthead. Nine mastheads used to read
   * `overlay.order + 1`, which was right only while the board listed this
   * array in declaration order.
   */
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
    role: 'OPEN CALL',
    family: 'instrument',
    purpose: 'Chat types entries; they fill a numbered list on screen.',
    how: [
      'You put a question on the scene',
      'Chat files with !add followed by anything',
      'Close it, then hand the list to the draw or the vote'
    ],
    sourcePurpose: 'The whole scene — the question, the list and the instruction',
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
    role: 'PRIZE DRAW',
    family: 'instrument',
    purpose: 'One entry is picked at random; bigger weights win more often.',
    how: [
      'Add entries yourself, or take a finished list from THE MUSTER',
      'Give an entry a weight from 1 to 999 to make it likelier',
      'Press Draw — the winner is decided before the spin animates'
    ],
    sourcePurpose: 'The whole scene — the ring, the entries and the result',
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
    role: 'CHAT VOTE',
    family: 'instrument',
    purpose: 'Chat votes by typing a number; the bars fill live.',
    how: [
      'You write the options',
      'Chat votes with !vote 2, or with a bare 2 — your choice which counts',
      'Close it; a tie is settled by a visible coin-toss'
    ],
    sourcePurpose: 'The full scene — the question and every bar',
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
    role: 'NOW PLAYING',
    family: 'furniture',
    purpose: 'Shows the track playing on your Spotify, with cover art and a timeline.',
    how: [
      'Link your Spotify account once, on this overlay’s page',
      'Pick one of four layouts — band, column, strip or spinning disc',
      'It follows your playback and hides itself when nothing is on'
    ],
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
    /*
     * Named for what it is rather than for one thing it is used for.
     *
     * `BREAK CLOCK` was the kind, and the two clocks then read as "the break
     * one" and "the start one" — which is wrong about this one. It counts down
     * to anything: a break, a segment, a drop, a guest joining. CONVENING is
     * the one with a single job. The operator renamed both.
     */
    role: 'MULTI-PURPOSE COUNTDOWN TIMER',
    family: 'clock',
    purpose: 'A countdown for breaks that keeps counting past zero.',
    how: [
      'Set how long the break is',
      'Press Start — Space works too, and you can add a minute mid-run',
      'Past zero it counts the overrun in crimson instead of stopping'
    ],
    epigraph: 'Time itself is constructed, maintained, and policed.',
    order: 4,
    implemented: true,
    document: 'timer',
    scope: [
      'Settable duration with one-tap presets, started and paused from the console',
      'Grace period past zero, counted down in crimson rather than stopping',
      'Five countdown faces the operator selects per timer',
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
    // The one clock with a single job, and the name says which. See INTERVAL
    // above for why the pair was renamed.
    role: 'STREAM STARTING COUNTDOWN',
    family: 'clock',
    purpose: 'A countdown before you go live that ends on one word.',
    how: [
      'Set how long before you start',
      'Press Start',
      'At zero it stops on one word — NOW, LIVE, or whatever you set'
    ],
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
    id: 'enclosure',
    slug: 'enclosure',
    label: 'THE ENCLOSURE',
    role: 'STREAM FRAME',
    family: 'furniture',
    purpose: 'Corner brackets and a name plate around the whole stream.',
    how: [
      'Type the name for the plate along the bottom',
      'Switch the ON AIR pip on when you go live',
      'Copy the address — for this one the settings travel in the URL'
    ],
    epigraph: 'The boundary is drawn, and the boundary is kept.',
    order: 6,
    implemented: true,
    /*
     * The first entry in the catalogue that carries no live state at all.
     *
     * Every other overlay is a thing that *happens* — a call, a draw, a ballot,
     * a track, two clocks — and each one needs a service, a repository and a
     * push. This is furniture: it is on screen for the whole broadcast and it
     * never changes by itself. That is why it costs a registry entry and two
     * files rather than a subsystem.
     */
    scope: [
      'Gold registration brackets at the four corners, nothing along the edges',
      'One obsidian plinth along the bottom, carrying the marque and a section numeral',
      'A single crimson pip, lit when the operator declares the broadcast live',
      'Marque, numeral and pip pinned by the address, so the URL is the whole setting',
      'Transparent throughout — it dresses a capture rather than replacing one'
    ],
    canvas: { width: 1920, height: 1080 },
    form: 'panel'
  },
  {
    id: 'gate',
    slug: 'gate',
    label: 'THE GATE',
    role: 'STARTING SCENE',
    family: 'scene',
    purpose: 'A full-screen “starting soon” scene with room for chat.',
    how: [
      'Write the headline and the quieter line beneath it',
      'Set how much of the frame to leave for a chat capture',
      'Copy the address onto your starting scene — do not tick Transparent'
    ],
    epigraph: 'The threshold is held open. The procession is still on the road.',
    order: 7,
    implemented: true,
    /*
     * The NEXUS landing field, put to work.
     *
     * Drawn rather than rendered — one canvas and a few thousand lines of
     * arithmetic, no 3D engine — which is what makes it cheap enough to hand to
     * OBS as a full scene. It is the only overlay that *replaces* a capture
     * rather than dressing one, because a stream that has not started has
     * nothing behind it to dress.
     */
    scope: [
      'The causeway, the portal and the procession, at full broadcast size',
      'A marque and a secondary line over the scene',
      'A reserved band at the right for chat, with its own gradient',
      'Gradient colours and strength set by the address',
      'Scale, type size and opacity, as everywhere else in the kit'
    ],
    canvas: { width: 1920, height: 1080 },
    /*
     * Served from the shared scene document, as the two countdowns share one.
     *
     * Every scene-backed overlay is the same page with a different field behind
     * it — same marque, same reserved band, same knobs. Giving each its own
     * implementation would mean two copies of four hundred lines that drift the
     * first time either is touched.
     */
    document: 'scene',
    form: 'full'
  },
  {
    id: 'survey',
    slug: 'survey',
    label: 'THE SURVEY',
    role: 'BRB SCENE',
    family: 'scene',
    purpose: 'A full-screen “be right back” scene with room for chat.',
    how: [
      'Write the headline and the quieter line beneath it',
      'Set how much of the frame to leave for a chat capture',
      'Copy the address onto your break scene — do not tick Transparent'
    ],
    epigraph: 'All arms resonant. The survey does not pause.',
    order: 8,
    implemented: true,
    document: 'scene',
    scope: [
      'A barred spiral seen from above and to one side, turning',
      'The resonance plexus threaded through the whole disc',
      'A marque and a secondary line, for saying how long you will be',
      'The same reserved chat band and gradient as THE GATE',
      'Scale, type size and opacity, as everywhere else in the kit'
    ],
    canvas: { width: 1920, height: 1080 },
    form: 'full'
  },
  {
    id: 'docket',
    slug: 'docket',
    label: 'THE DOCKET',
    role: 'REQUEST QUEUE',
    family: 'instrument',
    purpose: 'A queue of chat requests showing what you are working on next.',
    /*
     * Empty while reserved, and that is the honest state rather than an
     * oversight: `how` says how a thing is run, and nothing runs yet. The
     * board draws `scope` in its place, which is what describes work that has
     * been specified and not built.
     */
    how: [],
    epigraph: 'Mortals reduced to data; choices measured, deviance erased.',
    order: 9,
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

/**
 * The marque a scene-backed overlay starts with.
 *
 * Here rather than in either surface because both need it and they must agree:
 * the browser source falls back to these when the address carries nothing, and
 * the console seeds its fields from them. Two copies would drift, and the drift
 * would show up as a preview that does not match the broadcast.
 */
export const SCENE_MARQUE: Record<string, { title: string; sub: string }> = {
  gate: { title: 'STREAM STARTING SOON', sub: 'THE PROCESSION IS STILL ON THE ROAD' },
  survey: { title: 'BACK SHORTLY', sub: 'THE SURVEY CONTINUES WITHOUT US' }
}

/** The marque for a slug, falling back to the gate's. */
export function sceneMarque(slug: string): { title: string; sub: string } {
  return SCENE_MARQUE[slug] ?? SCENE_MARQUE.gate
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
    {
      slug: overlay.slug,
      label: overlay.label,
      // What the *address* is for, falling back to what the overlay is. See
      // `sourcePurpose`: captioning the primary row with a description of the
      // whole overlay reads as an error beside a secondary row that describes
      // itself properly.
      purpose: overlay.sourcePurpose ?? overlay.purpose,
      canvas: overlay.canvas
    },
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
