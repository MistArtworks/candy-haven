import widgetHtml from '@widget/widget.html?raw'
import widgetCss from '@widget/widget.css?raw'
import widgetJs from '@widget/widget.js?raw'
import widgetFields from '@widget/fields.json?raw'

/**
 * Generator for THE CHORUS — the Streamlabs chat widget.
 *
 * The widget is not served by the overlay server and never runs inside this
 * app. It is three files pasted into somebody else's editor, which makes it a
 * different kind of artefact from everything else in OBSERVATORY: the console's
 * job is not to run it but to *emit* it, configured.
 *
 * The three sources are imported verbatim with `?raw` rather than restated
 * here. A second copy maintained alongside the first is the one arrangement
 * guaranteed to eventually hand the operator a widget that differs from the one
 * in the repository, and the difference would only ever surface live.
 *
 * Configuration is applied by substitution at exactly two kinds of site:
 *
 *  - The four `{token}` placeholders Streamlabs itself would fill in the CSS.
 *  - One marked block in the JS holding the whole default configuration.
 *
 * Both are contiguous, unambiguous spans. Nothing here parses CSS or JS, and
 * nothing needs to.
 */

export const CHORUS_PRESETS = ['obsidian', 'sanctum', 'chamber'] as const
export type ChorusPreset = (typeof CHORUS_PRESETS)[number]

export const CHORUS_PRESET_LABEL: Record<ChorusPreset, string> = {
  obsidian: 'OBSIDIAN — the void',
  sanctum: 'SANCTUM — crimson glass',
  chamber: 'CHAMBER — pale stone'
}

export const CHORUS_ACCENTS = ['crimson', 'gold'] as const
export type ChorusAccent = (typeof CHORUS_ACCENTS)[number]

export interface ChorusConfig {
  preset: ChorusPreset
  /** Which material carries the live mark on the newest entry. */
  accent: ChorusAccent
  /** Width of the name column, as a percentage of the source. */
  nameWidth: number
  fontSize: number
  /** Seconds a message stays on screen. 0 keeps the log until it scrolls. */
  hideDelay: number
  /**
   * Backdrop behind the register.
   *
   * `transparent` is the default and the right answer for OBS — the scene is
   * composited underneath. A colour is only useful when the source is meant to
   * occupy space rather than sit over footage.
   */
  background: string
  textColour: string
  showIndex: boolean
  showMasthead: boolean
  brassBadges: boolean
  expungeRecords: boolean
  numeralRoll: boolean
  ambientMotion: boolean
}

export const CHORUS_DEFAULTS: ChorusConfig = {
  preset: 'obsidian',
  accent: 'crimson',
  nameWidth: 30,
  fontSize: 20,
  hideDelay: 60,
  background: 'transparent',
  textColour: '#ddcfb2',
  showIndex: true,
  showMasthead: true,
  brassBadges: true,
  expungeRecords: true,
  numeralRoll: true,
  ambientMotion: true
}

const CONFIG_START = '/* CHORUS:CONFIG */'
const CONFIG_END = '/* CHORUS:CONFIG-END */'

/**
 * The CSS with the four Streamlabs tokens resolved.
 *
 * The stylesheet declares each of these twice — a var()-based fallback first,
 * the token second — so that it stays valid CSS when nothing has substituted
 * anything. Filling the token in makes the second declaration win, which is the
 * same outcome Streamlabs produces on its own.
 */
export function chorusCss(config: ChorusConfig): string {
  return widgetCss
    .replace(/\{background_color\}/g, config.background.trim() || 'transparent')
    .replace(/\{text_color\}/g, config.textColour.trim() || '#ddcfb2')
    .replace(/\{font_size\}/g, `${config.fontSize}px`)
    .replace(/\{message_hide_delay\}/g, `${config.hideDelay}s`)
}

/** The JS with the marked configuration block rewritten. */
export function chorusJs(config: ChorusConfig): string {
  const body = [
    '  var DEFAULTS = {',
    `    preset: '${config.preset}',`,
    `    accent: '${config.accent}',`,
    `    name_width: ${config.nameWidth},`,
    `    show_index: ${config.showIndex},`,
    `    show_masthead: ${config.showMasthead},`,
    `    brass_badges: ${config.brassBadges},`,
    `    expunge_records: ${config.expungeRecords},`,
    `    numeral_roll: ${config.numeralRoll},`,
    `    ambient_motion: ${config.ambientMotion}`,
    '  }'
  ].join('\n')

  const start = widgetJs.indexOf(CONFIG_START)
  const end = widgetJs.indexOf(CONFIG_END)

  // Defensive rather than theoretical: the markers are comments, and a hand-edit
  // that strips comments would otherwise silently emit a widget carrying the
  // repository's defaults instead of the operator's choices. Appending an
  // override is uglier but stays correct.
  if (start === -1 || end === -1 || end < start) {
    return `${widgetJs}\n\n/* Configuration markers not found; applied as an override. */\nwindow.CHORUS && window.CHORUS.apply(${JSON.stringify(
      {
        preset: config.preset,
        accent: config.accent,
        name_width: config.nameWidth,
        show_index: config.showIndex,
        show_masthead: config.showMasthead,
        brass_badges: config.brassBadges,
        expunge_records: config.expungeRecords,
        numeral_roll: config.numeralRoll,
        ambient_motion: config.ambientMotion
      },
      null,
      2
    )})\n`
  }

  return widgetJs.slice(0, start + CONFIG_START.length) + '\n' + body + '\n  ' + widgetJs.slice(end)
}

/** The HTML, unchanged — its `{tokens}` are Streamlabs' and must survive. */
export function chorusHtml(): string {
  return widgetHtml
}

/** The optional custom-field definitions, for driving the widget from Streamlabs. */
export function chorusFields(): string {
  return widgetFields
}

// ---------------------------------------------------------------- preview

interface SampleEntry {
  from: string
  colour: string
  message: string
  moderator?: boolean
  deleted?: boolean
}

/**
 * Traffic chosen to be hostile to the palette rule.
 *
 * Twitch blue, green, purple and hot pink, plus two viewers who never set a
 * colour — if the hue mapping is going to put a sixth colour on the broadcast,
 * it will do it here rather than on stream.
 */
const SAMPLE: readonly SampleEntry[] = [
  {
    from: 'velvetiris',
    colour: '#1e90ff',
    message: 'harmony is maintained, operator',
    moderator: true
  },
  { from: 'korvan_9', colour: '#00ff7f', message: 'that ring looked unreal on stream last night' },
  { from: 'nyxori_dev', colour: '#9146ff', message: 'what preset is this one' },
  { from: 'sil_taa__', colour: '', message: 'struck from the record', deleted: true },
  {
    from: 'aevum_drifts',
    colour: '#ff69b4',
    message:
      'the numbers going up is doing something to me, i keep watching the corner instead of the stream'
  },
  {
    from: 'miren_spore',
    colour: '#ff4500',
    message: 'we do not question the shape of the universe'
  },
  { from: 'concrete_nexus', colour: '', message: 'is this the same thing as the poll overlay' }
]

/** Hue in degrees plus saturation, mirroring the widget's own reading. */
function hueOf(value: string): { hue: number; saturation: number } | null {
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())) return null

  let hex = value.trim()
  if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`

  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  if (delta === 0) return { hue: 0, saturation: 0 }

  let hue: number
  if (max === r) hue = ((g - b) / delta) % 6
  else if (max === g) hue = (b - r) / delta + 2
  else hue = (r - g) / delta + 4

  hue *= 60
  if (hue < 0) hue += 360

  const lightness = (max + min) / 2
  const denominator = 1 - Math.abs(2 * lightness - 1)
  return { hue, saturation: denominator === 0 ? 0 : delta / denominator }
}

function hashOf(text: string): number {
  let hash = 0
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  return hash
}

const TONE_COUNT = 7

/**
 * The same slot the widget would choose.
 *
 * Restated rather than imported because the widget is plain ES5 in a file the
 * bundler only ever reads as text — and the preview would be worthless if it
 * showed a different tone from the one the operator is about to paste.
 */
function toneFor(colour: string, name: string): number {
  const hs = hueOf(colour)
  if (hs && hs.saturation >= 0.15) {
    return (Math.floor((hs.hue / 360) * TONE_COUNT) % TONE_COUNT) + 1
  }
  return (hashOf(name.toLowerCase()) % TONE_COUNT) + 1
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * A self-contained document for the preview frame.
 *
 * Styling only — no script. The console's CSP is `script-src 'self'`, which a
 * `srcdoc` frame inherits, so an inline script would simply be refused. The
 * numbering, tone slots and live mark that widget.js would apply at runtime are
 * therefore pre-rendered here instead, which has the useful side effect of
 * making the preview a check on the mapping rather than a re-run of it.
 *
 * The webfont `@import` is stripped for the same reason — it is not on the
 * console's allow-list, and letting it fail would put a CSP error in the
 * console on every keystroke. Bahnschrift is present on the machine anyway.
 */
export function chorusPreviewDocument(config: ChorusConfig): string {
  const css = chorusCss(config).replace(/@import url\([^)]*\);?/g, '')

  const rows = SAMPLE.map((entry, position) => {
    const tone = toneFor(entry.colour, entry.from)
    const index = String(position + 141).padStart(4, '0')
    const live = position === SAMPLE.length - 1 ? ' is-live' : ''
    const deleted = entry.deleted ? ' deleted' : ''
    const badge = entry.moderator
      ? "<img class=\"badge\" src=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 18 18'%3E%3Crect width='18' height='18' rx='2' fill='%2300ad03'/%3E%3Cpath d='M4 8h10v2H4z' fill='white'/%3E%3C/svg%3E\" alt=\"\">"
      : ''

    const classes = `${live}${deleted}`.trim()

    return `<div class="${classes}" data-tone="${tone}" data-from="${escapeHtml(entry.from)}">
      <span class="index">${index}</span>
      <span class="meta"><span class="meta-inner"><span class="badges">${badge}</span><span class="name">${escapeHtml(entry.from)}</span></span></span>
      <span class="message">${escapeHtml(entry.message)}</span>
    </div>`
  }).join('\n')

  return `<!doctype html>
<html data-theme="${config.preset}" data-accent="${config.accent}" data-index="${
    config.showIndex ? 'on' : 'off'
  }" data-badges="${config.brassBadges ? 'brass' : 'native'}" data-expunge="${
    config.expungeRecords ? 'stamp' : 'hide'
  }" data-masthead="${config.showMasthead ? 'on' : 'off'}" data-motion="${
    config.ambientMotion ? 'full' : 'still'
  }" style="--ch-name-width: ${config.nameWidth}%">
<head><meta charset="utf-8"><style>${css}</style></head>
<body>
<div id="masthead" aria-hidden="true">
  <svg class="sigil" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="0.9" opacity="0.5"/><line x1="12" y1="0.6" x2="12" y2="23.4" stroke="currentColor" stroke-width="0.7" opacity="0.35"/><path d="M12 1.4 Q13 10.6 22.6 12 Q13 13.4 12 22.6 Q11 13.4 1.4 12 Q11 10.6 12 1.4 Z" fill="currentColor"/></svg>
  <span class="mast-title">The Chorus</span>
  <span class="mast-rule"></span>
  <span class="mast-note">Resonance Register</span>
</div>
<div id="log" class="sl__chat__layout">
${rows}
</div>
</body>
</html>`
}
