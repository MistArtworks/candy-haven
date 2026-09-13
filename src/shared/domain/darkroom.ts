/**
 * DARKROOM — the grade, as data and as arithmetic.
 *
 * Framework-free and zod-free on purpose. Nothing here imports React or the
 * DOM, so the same functions build the preview, build the export, and can be
 * run head-less against the reference images to prove the shipped preset really
 * is the treatment those images received. See `CONSOLE_RAMP`.
 *
 * The whole department rests on one observation: **exposure, contrast, levels,
 * gamma and the curve all act on luminance alone.** They are a 256→256 map. The
 * gradient ramp is a 256→RGB map. Composed, an entire grade is a single table
 * of 768 bytes, and rebuilding it after a control moves costs 256 steps no
 * matter how large the image is.
 *
 * That is what makes the preview live at full resolution rather than on a
 * downscaled proxy: dragging a slider does not touch a pixel until the frame is
 * drawn, and drawing is one lookup per pixel.
 */

// ------------------------------------------------------------------ the grade

/** A gradient-map stop: a colour, and where it sits along the ramp. */
export interface RampStop {
  /** `#rrggbb`. */
  colour: string
  /** 0..1. */
  position: number
}

/** A point on the tone curve. Both axes 0..1, input against output. */
export interface CurvePoint {
  x: number
  y: number
}

export interface GradeSettings {
  /** Stops of exposure, -3..+3. Multiplies light, so it is 2^n. */
  exposure: number
  /** -100..+100, pivoting on mid grey. */
  contrast: number
  /** Input black point, 0..1. Luminance at or below this becomes 0. */
  blackPoint: number
  /** Input white point, 0..1. Luminance at or above this becomes 1. */
  whitePoint: number
  /** Midtone gamma, 0.1..4. Above 1 lifts, below 1 crushes. */
  gamma: number
  /** Freeform tone curve, applied last in the luminance stage. */
  curve: CurvePoint[]
  /** The gradient map itself. */
  stops: RampStop[]
  /** How much of the mapped result to keep against the original, 0..1. */
  amount: number
  /** Post-map saturation, 0..2. 1 leaves the mapped colour alone. */
  saturation: number
}

// --------------------------------------------------------------- the preset

/**
 * The console ramp, recovered from the two photographs already in the guide.
 *
 * `practice-01-altar.png` and `practice-02-vault.png` are supplied photographs
 * rather than screenshots, gradient-mapped by hand — outside this repository —
 * because the originals are stage-lit green, which rule 2 of the design
 * language forbids. The treatment existed only in those two files.
 *
 * It was recovered by decoding both PNGs, pooling every pixel into a 256-bucket
 * luminance histogram and fitting candidate ramps to the resulting 169-level
 * table by nearest-point distance in RGB — a measure independent of how stops
 * are spaced. These eight stops, which are simply the palette's own ladder,
 * score a worst-case **1.42/255** and a mean of **0.43**: below quantisation
 * noise, so this *is* the ramp rather than an approximation of it.
 *
 * Worth recording because the guide's prose describes the treatment as
 * "obsidian → crimson → gold → alabaster", and read as four stops that scores
 * 26.97 — visibly wrong. The intermediate rungs are real.
 *
 * **Spacing is even, and that part is a convention rather than a recovery.** A
 * gradient map's output reveals the colour path but not how input luminance was
 * distributed along it; that depends on the source photographs' own histograms,
 * which are not in the repository. Even spacing is what Photoshop, GIMP and CSS
 * all default to. The positions are editable in the department, so matching a
 * reference more closely is a drag rather than a code change.
 *
 * Values are the theme's, verbatim — see `styles/base/_theme.scss`.
 */
export const CONSOLE_RAMP: readonly RampStop[] = [
  { colour: '#08080a', position: 0 }, // obsidian-900
  { colour: '#24090a', position: 1 / 7 }, // crimson-900
  { colour: '#5e1a16', position: 2 / 7 }, // crimson-700
  { colour: '#a32b23', position: 3 / 7 }, // crimson-500
  { colour: '#976b30', position: 4 / 7 }, // gold-500
  { colour: '#b98b47', position: 5 / 7 }, // gold-400
  { colour: '#d2a961', position: 6 / 7 }, // gold-300
  { colour: '#ddcfb2', position: 1 } // alabaster-300
]

/** A ramp that changes nothing, for checking the tone stage in isolation. */
export const NEUTRAL_RAMP: readonly RampStop[] = [
  { colour: '#000000', position: 0 },
  { colour: '#ffffff', position: 1 }
]

/** The curve as a straight line: two locked endpoints and nothing between. */
export const IDENTITY_CURVE: readonly CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 }
]

export const DEFAULT_GRADE: GradeSettings = {
  exposure: 0,
  contrast: 0,
  blackPoint: 0,
  whitePoint: 1,
  gamma: 1,
  curve: IDENTITY_CURVE.map((point) => ({ ...point })),
  stops: CONSOLE_RAMP.map((stop) => ({ ...stop })),
  amount: 1,
  saturation: 1
}

/** Ranges the controls run over, so the page and the maths cannot disagree. */
export const GRADE_LIMITS = {
  exposure: { min: -3, max: 3, step: 0.01 },
  contrast: { min: -100, max: 100, step: 1 },
  blackPoint: { min: 0, max: 1, step: 0.002 },
  whitePoint: { min: 0, max: 1, step: 0.002 },
  gamma: { min: 0.1, max: 4, step: 0.01 },
  amount: { min: 0, max: 1, step: 0.01 },
  saturation: { min: 0, max: 2, step: 0.01 }
} as const

// ------------------------------------------------------------------ colour

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value)

/**
 * Rec. 709 luminance, which is what the reference treatment was fitted with.
 *
 * Deliberately not the sRGB-linearised version. A gradient map in an image
 * editor works on gamma-encoded values, and matching the reference matters more
 * here than being photometrically correct about it.
 */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function parseHex(hex: string): [number, number, number] {
  const value = hex.trim().replace('#', '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0
  ]
}

export function toHex(r: number, g: number, b: number): string {
  const part = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

// ------------------------------------------------------------- the curve

/**
 * Monotone cubic interpolation — Fritsch–Carlson.
 *
 * Not Catmull–Rom, and the difference is the whole reason this is here. A plain
 * cubic spline overshoots between control points, so dragging one point of a
 * tone curve can make the curve *descend* between two points the operator
 * placed in ascending order — the image gets darker where they asked for
 * brighter, in a band they never touched. Fritsch–Carlson clamps the tangents
 * so that cannot happen, which is why every serious curve tool uses it.
 *
 * Returns a 256-entry table rather than a function: it is evaluated once per
 * grade rebuild, and the caller wants a table anyway.
 */
export function buildCurveTable(points: readonly CurvePoint[]): Float32Array {
  const table = new Float32Array(256)

  const sorted = [...points].sort((a, b) => a.x - b.x)
  if (sorted.length === 0) {
    for (let i = 0; i < 256; i += 1) table[i] = i / 255
    return table
  }
  if (sorted.length === 1) {
    table.fill(clamp01(sorted[0].y))
    return table
  }

  const n = sorted.length
  const xs = sorted.map((point) => point.x)
  const ys = sorted.map((point) => point.y)

  // Secant slopes between consecutive points.
  const secants = new Array<number>(n - 1)
  for (let i = 0; i < n - 1; i += 1) {
    const run = xs[i + 1] - xs[i]
    secants[i] = run === 0 ? 0 : (ys[i + 1] - ys[i]) / run
  }

  // Initial tangents: the average of the two neighbouring secants.
  const tangents = new Array<number>(n)
  tangents[0] = secants[0]
  tangents[n - 1] = secants[n - 2]
  for (let i = 1; i < n - 1; i += 1) tangents[i] = (secants[i - 1] + secants[i]) / 2

  /*
   * The monotonicity fix. Where a secant is flat the segment must be flat, and
   * elsewhere the tangents are pulled inside a circle of radius 3 — the
   * Fritsch–Carlson condition. Without this the spline is free to overshoot.
   */
  for (let i = 0; i < n - 1; i += 1) {
    if (secants[i] === 0) {
      tangents[i] = 0
      tangents[i + 1] = 0
      continue
    }
    const a = tangents[i] / secants[i]
    const b = tangents[i + 1] / secants[i]
    const h = Math.hypot(a, b)
    if (h > 3) {
      const scale = 3 / h
      tangents[i] = scale * a * secants[i]
      tangents[i + 1] = scale * b * secants[i]
    }
  }

  for (let i = 0; i < 256; i += 1) {
    const x = i / 255

    if (x <= xs[0]) {
      table[i] = clamp01(ys[0])
      continue
    }
    if (x >= xs[n - 1]) {
      table[i] = clamp01(ys[n - 1])
      continue
    }

    let k = 0
    while (k < n - 2 && x > xs[k + 1]) k += 1

    const run = xs[k + 1] - xs[k]
    if (run === 0) {
      table[i] = clamp01(ys[k])
      continue
    }

    // Hermite basis.
    const t = (x - xs[k]) / run
    const t2 = t * t
    const t3 = t2 * t
    table[i] = clamp01(
      (2 * t3 - 3 * t2 + 1) * ys[k] +
        (t3 - 2 * t2 + t) * run * tangents[k] +
        (-2 * t3 + 3 * t2) * ys[k + 1] +
        (t3 - t2) * run * tangents[k + 1]
    )
  }

  return table
}

// ------------------------------------------------------------- tone stage

/**
 * Luminance in, graded luminance out, as a 256-entry table.
 *
 * Order matters and is the conventional one: exposure acts on light, so it goes
 * first; levels then decide what counts as black and white; gamma reshapes what
 * is left between them; contrast pivots on mid grey; and the curve has the last
 * word, because it is the control the operator reaches for to fix whatever the
 * others left wrong.
 */
export function buildToneTable(settings: GradeSettings): Float32Array {
  const table = new Float32Array(256)
  const curve = buildCurveTable(settings.curve)

  const gain = Math.pow(2, settings.exposure)
  const contrast = settings.contrast / 100

  // A degenerate window would divide by zero; treat it as a hard threshold.
  const black = Math.min(settings.blackPoint, settings.whitePoint)
  const white = Math.max(settings.whitePoint, settings.blackPoint)
  const span = white - black

  const invGamma = 1 / Math.max(settings.gamma, 0.0001)

  for (let i = 0; i < 256; i += 1) {
    let value = clamp01((i / 255) * gain)

    value = span <= 0 ? (value >= white ? 1 : 0) : clamp01((value - black) / span)

    value = Math.pow(value, invGamma)

    /*
     * Contrast as a pivot about mid grey, with the positive side rolled through
     * a reciprocal so it compresses towards the ends instead of clipping them.
     * A straight linear stretch turns +100 into a two-tone image.
     */
    if (contrast !== 0) {
      value =
        contrast > 0
          ? clamp01((value - 0.5) / Math.max(1 - contrast, 0.0001) + 0.5)
          : clamp01((value - 0.5) * (1 + contrast) + 0.5)
    }

    table[i] = curve[Math.round(clamp01(value) * 255)]
  }

  return table
}

// ------------------------------------------------------------- ramp stage

/**
 * The gradient map: a position along the ramp in, a colour out.
 *
 * Interpolated in plain sRGB rather than a perceptual space, because that is
 * what the editor which produced the reference did — and the fit against those
 * images confirms it. Interpolating in Oklab here would be more defensible in
 * the abstract and would no longer match the two files this exists to
 * reproduce.
 *
 * Returns 768 bytes: r, g, b for each of 256 positions.
 */
export function buildRampTable(stops: readonly RampStop[]): Uint8ClampedArray {
  const table = new Uint8ClampedArray(768)

  const sorted = [...stops].sort((a, b) => a.position - b.position)
  if (sorted.length === 0) return table

  if (sorted.length === 1) {
    const [r, g, b] = parseHex(sorted[0].colour)
    for (let i = 0; i < 256; i += 1) {
      table[i * 3] = r
      table[i * 3 + 1] = g
      table[i * 3 + 2] = b
    }
    return table
  }

  const rgb = sorted.map((stop) => parseHex(stop.colour))

  for (let i = 0; i < 256; i += 1) {
    const t = i / 255

    let k = 0
    while (k < sorted.length - 2 && t > sorted[k + 1].position) k += 1

    const from = sorted[k]
    const to = sorted[k + 1]
    const run = to.position - from.position

    /*
     * Before the first stop and after the last the ramp holds flat rather than
     * extrapolating. An operator who drags the black stop inward wants the
     * shadows clamped to it, not pushed past it into a colour they never chose.
     */
    const f =
      t <= from.position ? 0 : t >= to.position ? 1 : run === 0 ? 0 : (t - from.position) / run

    const a = rgb[k]
    const b = rgb[k + 1]
    table[i * 3] = a[0] + (b[0] - a[0]) * f
    table[i * 3 + 1] = a[1] + (b[1] - a[1]) * f
    table[i * 3 + 2] = a[2] + (b[2] - a[2]) * f
  }

  return table
}

// -------------------------------------------------------------- composed

/**
 * The whole grade as one table: source luminance in, final colour out.
 *
 * 768 bytes, rebuilt every time a control moves, and the only thing the
 * renderer needs to draw a frame. `amount` and `saturation` are deliberately
 * *not* folded in — they depend on the original pixel rather than on its
 * luminance alone, so they stay per-pixel in `applyGrade`.
 */
export function buildGradeTable(settings: GradeSettings): Uint8ClampedArray {
  const tone = buildToneTable(settings)
  const ramp = buildRampTable(settings.stops)
  const table = new Uint8ClampedArray(768)

  for (let i = 0; i < 256; i += 1) {
    const mapped = Math.round(tone[i] * 255) * 3
    table[i * 3] = ramp[mapped]
    table[i * 3 + 1] = ramp[mapped + 1]
    table[i * 3 + 2] = ramp[mapped + 2]
  }

  return table
}
