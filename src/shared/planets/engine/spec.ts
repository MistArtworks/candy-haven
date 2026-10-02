import { z } from 'zod';

// What a planet is, as data: a surface, a rim, a faint shade, and a stack
// of layers drawn over it. Every planet on the lore pages is one of these,
// and so is every planet made in Candy Haven's LORE editor: the 11 looks
// the chapters were designed with are presets written in the same terms
// (presets.ts), so a custom planet is drawn by exactly the same code.
//
// A layer type is described once, in LAYER_TYPES: its name, group,
// colours and controls, each with its range and default. The website
// validates against it, and Haven builds its editor from it, so a control
// added here shows up in both.
//
// Shared with Candy Haven: this folder is copied there as it is, so it
// imports nothing outside itself except zod. Edit it here, then run
// Haven's `npm run sync:planets`.

/** The planet's own box: 355 across, the size the designs were drawn at. */
export const PLANET_SIZE = 355;
export const PLANET_R = PLANET_SIZE / 2;

/** How many layers one planet may stack. */
export const MAX_LAYERS = 24;

/** Past this many shapes a planet starts to cost phones a smooth scroll. */
export const HEAVY_SHAPES = 1500;

/** The site's palette, offered first wherever a colour is picked. */
export const SWATCHES = [
  { name: 'Gilt', hex: '#d2a961' },
  { name: 'Gilt bright', hex: '#e3c286' },
  { name: 'Gilt deep', hex: '#b98b47' },
  { name: 'Gold', hex: '#b69e7c' },
  { name: 'Gold dim', hex: '#8f7d63' },
  { name: 'Ivory', hex: '#ddcfb2' },
  { name: 'Alabaster', hex: '#cdb994' },
  { name: 'Crimson glow', hex: '#c4453a' },
  { name: 'Crimson', hex: '#a32b23' },
  { name: 'Crimson light', hex: '#db7a6f' },
  { name: 'Concrete light', hex: '#8a8071' },
  { name: 'Concrete', hex: '#6f6656' },
  { name: 'Concrete deep', hex: '#3b372f' },
  { name: 'Ink', hex: '#2b2723' },
  { name: 'Obsidian raised', hex: '#111011' },
  { name: 'Obsidian', hex: '#0c0c0c' }
] as const;

const C = {
  gilt: '#d2a961',
  gold: '#b69e7c',
  ivory: '#ddcfb2',
  crimson: '#c4453a',
  concrete: '#8a8071',
  ink: '#2b2723',
  surface: '#111011',
  obsidian: '#0c0c0c'
} as const;

export const MOTION_KINDS = [
  'none',
  'spin',
  'pulse',
  'flicker',
  'drift'
] as const;
export type MotionKind = (typeof MOTION_KINDS)[number];

export const MOTION_LABEL: Record<MotionKind, string> = {
  none: 'Still',
  spin: 'Spin',
  pulse: 'Pulse',
  flicker: 'Flicker',
  drift: 'Drift'
};

export const BLENDS = [
  'normal',
  'screen',
  'multiply',
  'overlay',
  'lighten',
  'darken',
  'difference'
] as const;
export type Blend = (typeof BLENDS)[number];

export const DASHES = ['solid', 'dashed', 'dotted'] as const;
export type Dash = (typeof DASHES)[number];

export const SURFACE_KINDS = ['solid', 'gradient', 'grain'] as const;
export type SurfaceKind = (typeof SURFACE_KINDS)[number];

// ---------------------------------------------------------------- controls

export interface ChoiceOption {
  value: string;
  label: string;
}

/** One control of a layer type: what it's called, its range, its default. */
export type ParamDef =
  | {
      kind: 'number';
      label: string;
      min: number;
      max: number;
      step: number;
      default: number;
      hint?: string;
    }
  | {
      kind: 'int';
      label: string;
      min: number;
      max: number;
      default: number;
      hint?: string;
    }
  | { kind: 'boolean'; label: string; default: boolean; hint?: string }
  | {
      kind: 'choice';
      label: string;
      options: readonly ChoiceOption[];
      default: string;
      hint?: string;
    }
  | {
      /**
       * A list of positions, each between min and max. The editor sets it by
       * a count, spread evenly; a preset may hold any positions it likes.
       */
      kind: 'list';
      label: string;
      min: number;
      max: number;
      maxItems: number;
      default: readonly number[];
      /** Whether the positions sit either side of the centre. */
      signed: boolean;
      /** How far from the centre an evenly spread list reaches. */
      spread: number;
      hint?: string;
    };

export type ParamValue = number | boolean | string | number[];
export type LayerParams = Record<string, ParamValue>;

export const LAYER_GROUPS = [
  { id: 'structure', label: 'Structure' },
  { id: 'network', label: 'Network' },
  { id: 'marks', label: 'Marks' },
  { id: 'interference', label: 'Interference' },
  { id: 'beyond', label: 'Beyond the edge' }
] as const;
export type LayerGroup = (typeof LAYER_GROUPS)[number]['id'];

export interface LayerTypeDef {
  label: string;
  group: LayerGroup;
  description: string;
  /** Drawn outside the planet's circle (and never clipped to it). */
  outside?: boolean;
  /** What the two colours paint, in this type's terms. */
  colors: { color: string; color2?: string };
  /** Which of the shared controls mean anything for this type. */
  uses: { width?: string; filled?: boolean; dash?: boolean };
  defaults: {
    color: string;
    color2: string;
    opacity: number;
    width: number;
    filled: boolean;
    dash: Dash;
  };
  params: Record<string, ParamDef>;
}

const num = (
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  hint?: string
): ParamDef => ({
  kind: 'number',
  label,
  min,
  max,
  step,
  default: value,
  hint
});
const int = (
  label: string,
  min: number,
  max: number,
  value: number,
  hint?: string
): ParamDef => ({ kind: 'int', label, min, max, default: value, hint });
const bool = (label: string, value: boolean, hint?: string): ParamDef => ({
  kind: 'boolean',
  label,
  default: value,
  hint
});
const choice = (
  label: string,
  options: Array<[string, string]>,
  value: string,
  hint?: string
): ParamDef => ({
  kind: 'choice',
  label,
  options: options.map(([v, l]) => ({ value: v, label: l })),
  default: value,
  hint
});

const defaults = (
  color: string,
  color2: string,
  opacity = 1,
  width = 1,
  filled = false
) => ({ color, color2, opacity, width, filled, dash: 'solid' as Dash });

// Inner sizes are fractions of the planet's radius throughout: 1 is the
// edge, 0.5 halfway in. Line and dot sizes in the drawing's own units.
export const LAYER_TYPES = {
  // ------------------------------------------------------------ structure
  grid: {
    label: 'Grid',
    group: 'structure',
    description: 'The tilted lines of latitude and longitude.',
    colors: { color: 'Lines' },
    uses: { width: 'Line width', dash: true },
    defaults: defaults(C.gold, C.gilt, 0.16, 0.8),
    params: {
      meridians: {
        kind: 'list',
        label: 'Meridians',
        min: 0.02,
        max: 1,
        maxItems: 12,
        default: [0.3, 0.64, 0.9],
        signed: false,
        spread: 0.9
      },
      parallels: {
        kind: 'list',
        label: 'Parallels',
        min: -0.98,
        max: 0.98,
        maxItems: 15,
        default: [-0.62, -0.3, 0, 0.3, 0.62],
        signed: true,
        spread: 0.85
      },
      tilt: num('Tilt', -90, 90, 0.5, -18.334649444186343),
      curve: num('Curve of the parallels', 0, 0.6, 0.01, 0.16)
    }
  },
  contours: {
    label: 'Contours',
    group: 'structure',
    description: 'Map-style rings, like the lines of a relief map.',
    colors: { color: 'Lines' },
    uses: { width: 'Line width', dash: true },
    defaults: defaults(C.gold, C.gilt, 0.3, 0.7),
    params: {
      count: int('Rings', 1, 24, 7),
      inner: num('Innermost', 0.02, 0.9, 0.01, 0.12),
      outer: num('Outermost', 0.1, 1, 0.01, 0.92),
      waviness: num('Waviness', 0, 1, 0.01, 0.35),
      lobes: int('Lobes', 1, 12, 4)
    }
  },
  bands: {
    label: 'Bands',
    group: 'structure',
    description: 'Stripes across the planet, like a gas giant.',
    colors: { color: 'Bands' },
    uses: { width: 'Outline width', filled: true, dash: true },
    defaults: defaults(C.gold, C.gilt, 0.14, 0.8, true),
    params: {
      count: int('Bands', 1, 16, 6),
      thickness: num('Thickness', 0.01, 0.4, 0.005, 0.08),
      variation: num('Variation', 0, 1, 0.01, 0.5),
      waviness: num('Waviness', 0, 1, 0.01, 0.3),
      waves: int('Waves across', 1, 8, 3)
    }
  },
  mesh: {
    label: 'Mesh',
    group: 'structure',
    description: 'A net of triangles, hexagons or squares wrapped round it.',
    colors: { color: 'Lines' },
    uses: { width: 'Line width', dash: true },
    defaults: defaults(C.gold, C.gilt, 0.18, 0.6),
    params: {
      pattern: choice(
        'Pattern',
        [
          ['hexagons', 'Hexagons'],
          ['triangles', 'Triangles'],
          ['squares', 'Squares']
        ],
        'hexagons'
      ),
      cell: num('Cell size', 0.04, 0.5, 0.005, 0.16),
      curvature: num(
        'Curvature',
        0,
        1,
        0.01,
        0.6,
        'How much it bulges, as on a globe.'
      )
    }
  },
  scanlines: {
    label: 'Scan lines',
    group: 'structure',
    description: 'Fine parallel lines across the whole planet.',
    colors: { color: 'Lines' },
    uses: { width: 'Line width', dash: true },
    defaults: defaults(C.gold, C.gilt, 0.12, 0.6),
    params: {
      spacing: num('Spacing', 2, 40, 0.5, 7)
    }
  },
  halftone: {
    label: 'Halftone',
    group: 'structure',
    description: 'A grid of dots that shrink toward one side.',
    colors: { color: 'Dots' },
    uses: { width: 'Outline width', filled: true },
    defaults: defaults(C.gold, C.gilt, 0.35, 0.6, true),
    params: {
      spacing: num('Spacing', 4, 40, 0.5, 11),
      size: num('Dot size', 0.1, 1, 0.01, 0.55),
      fade: num('Fade', 0, 1, 0.01, 0.75),
      direction: num(
        'Fade toward',
        -180,
        180,
        1,
        0,
        'The angle the dots shrink toward.'
      )
    }
  },

  // --------------------------------------------------------------- network
  veins: {
    label: 'Veins',
    group: 'network',
    description: 'The fungal network, branching out from the core.',
    colors: { color: 'Veins' },
    uses: { width: 'Width', dash: true },
    defaults: defaults(C.gilt, C.gold, 0.9, 1.3),
    params: {
      count: int('Veins', 1, 24, 9),
      steps: int('Length', 2, 40, 16),
      step: num('Step', 3, 24, 0.5, 11),
      wander: num('Wander', 0, 1.5, 0.01, 0.7),
      branching: num('Branching', 0, 0.6, 0.01, 0.16),
      branchTurn: num('Branch angle', 0, 1.6, 0.01, 0.9),
      depth: int('Branch depth', 0, 4, 2),
      branchLength: num('Branch length', 0.2, 1, 0.01, 0.55),
      reach: num('Reach', 0.2, 1, 0.01, 0.96),
      jitter: num('Start jitter', 0, 1.5, 0.01, 0.4),
      curl: num(
        'Curl',
        -0.5,
        0.5,
        0.01,
        0,
        'A steady turn, so the veins swirl.'
      ),
      taper: num('Taper', 0, 1, 0.01, 0, 'How much thinner the branches are.')
    }
  },
  constellation: {
    label: 'Constellation',
    group: 'network',
    description: 'Scattered dots, the near ones linked.',
    colors: { color: 'Dots', color2: 'Links' },
    uses: { width: 'Link width' },
    defaults: defaults(C.gilt, C.gold, 1, 0.7, true),
    params: {
      points: int('Dots', 2, 150, 46),
      spread: num('Spread', 0.1, 1, 0.01, 0.9),
      link: num('Link distance', 0, 0.6, 0.005, 0.24),
      linkOpacity: num('Link opacity', 0, 1, 0.01, 0.35),
      dot: num('Dot size', 0.003, 0.06, 0.001, 0.015),
      bigDot: num('Large dot size', 0.003, 0.08, 0.001, 0.025),
      bigEvery: int(
        'Large every',
        0,
        12,
        4,
        'Every nth dot is large; 0 for none.'
      )
    }
  },
  beings: {
    label: 'Line of beings',
    group: 'network',
    description: 'One line through dots set round the core.',
    colors: { color: 'Line', color2: 'Dots' },
    uses: { width: 'Line width', dash: true },
    defaults: defaults(C.gilt, C.gilt, 1, 1, true),
    params: {
      count: int('Beings', 2, 36, 9),
      distance: num('Distance from the core', 0.05, 0.98, 0.01, 0.62),
      dot: num('Dot size', 0.005, 0.08, 0.001, 0.025),
      loop: choice(
        'Line',
        [
          ['closed', 'Closed loop'],
          ['open', 'Open'],
          ['none', 'No line']
        ],
        'closed'
      ),
      lineOpacity: num('Line opacity', 0, 1, 0.01, 0.8)
    }
  },
  orbits: {
    label: 'Orbit paths',
    group: 'network',
    description: 'Ellipses inside the planet, with bodies on them.',
    colors: { color: 'Paths', color2: 'Bodies' },
    uses: { width: 'Line width', dash: true },
    defaults: defaults(C.gold, C.gilt, 0.45, 0.7),
    params: {
      count: int('Paths', 1, 8, 3),
      inner: num('Innermost', 0.1, 0.95, 0.01, 0.35),
      outer: num('Outermost', 0.2, 0.98, 0.01, 0.85),
      flatness: num('Roundness', 0.08, 1, 0.01, 0.35),
      bodies: int('Bodies per path', 0, 6, 1),
      bodySize: num('Body size', 0.004, 0.08, 0.001, 0.02)
    }
  },
  circuits: {
    label: 'Circuit traces',
    group: 'network',
    description: 'Right-angled lines ending in nodes.',
    colors: { color: 'Traces', color2: 'Nodes' },
    uses: { width: 'Line width', dash: true },
    defaults: defaults(C.gold, C.gilt, 0.5, 0.7),
    params: {
      traces: int('Traces', 1, 60, 14),
      segments: int('Turns', 1, 8, 4),
      length: num('Segment length', 0.03, 0.4, 0.005, 0.13),
      node: num('Node size', 0, 0.05, 0.001, 0.012),
      spread: num('Spread', 0.1, 1, 0.01, 0.8)
    }
  },

  // ----------------------------------------------------------------- marks
  core: {
    label: 'Core',
    group: 'marks',
    description: 'The point at the centre. Always drawn above the shade.',
    colors: { color: 'Core', color2: 'Ring' },
    uses: { width: 'Ring width' },
    defaults: defaults(C.gilt, C.crimson, 1, 1, true),
    params: {
      size: num('Size', 0.005, 0.25, 0.001, 0.025),
      shape: choice(
        'Shape',
        [
          ['dot', 'Dot'],
          ['ring', 'Ring'],
          ['double', 'Double ring'],
          ['diamond', 'Diamond']
        ],
        'dot'
      ),
      ring: bool('Outer ring', false),
      ringSize: num('Ring size', 0.03, 0.6, 0.005, 0.11),
      ringOpacity: num('Ring opacity', 0, 1, 0.01, 0.5)
    }
  },
  sigil: {
    label: 'Sigil',
    group: 'marks',
    description: 'The etched star, with its ring and eye.',
    colors: { color: 'Lines' },
    uses: { width: 'Line width', dash: true },
    defaults: defaults(C.gilt, C.gilt, 1, 1.2),
    params: {
      points: int('Points', 3, 12, 4),
      outer: num('Size', 0.05, 0.98, 0.01, 0.62),
      inner: num(
        'Waist',
        0.01,
        0.9,
        0.005,
        0.2 * Math.SQRT2,
        'How far in the star narrows between its points.'
      ),
      ring: bool('Ring', true),
      ringSize: num('Ring size', 0.05, 1.3, 0.01, 0.75),
      ringOpacity: num('Ring opacity', 0, 1, 0.01, 0.6),
      eye: bool('Eye', true),
      eyeSize: num('Eye size', 0.005, 0.4, 0.001, 0.09)
    }
  },
  emblem: {
    label: 'Emblem',
    group: 'marks',
    description: 'The Candy Heist vortex, or the four-pointed sigil.',
    colors: { color: 'Emblem' },
    uses: { width: 'Outline width', filled: true, dash: true },
    defaults: defaults(C.gilt, C.gold, 0.5, 1, true),
    params: {
      emblem: choice(
        'Emblem',
        [
          ['vortex', 'Vortex'],
          ['sigil', 'Sigil']
        ],
        'vortex'
      ),
      size: num('Size', 0.05, 1.8, 0.01, 0.9)
    }
  },
  dial: {
    label: 'Dial ring',
    group: 'marks',
    description: 'Tick marks round a circle, like an instrument.',
    colors: { color: 'Ticks' },
    uses: { width: 'Tick width' },
    defaults: defaults(C.gold, C.gilt, 0.4, 0.8),
    params: {
      radius: num('Radius', 0.1, 0.99, 0.01, 0.86),
      ticks: int('Ticks', 4, 240, 72),
      length: num('Tick length', 0.005, 0.3, 0.001, 0.04),
      majorEvery: int(
        'Long every',
        0,
        48,
        6,
        'Every nth tick is long; 0 for none.'
      ),
      majorLength: num('Long tick length', 0.005, 0.4, 0.001, 0.09),
      ring: bool('Circle', false)
    }
  },
  craters: {
    label: 'Craters',
    group: 'marks',
    description: 'Circles of different sizes across the surface.',
    colors: { color: 'Craters', color2: 'Rims' },
    uses: { width: 'Line width', filled: true, dash: true },
    defaults: defaults(C.gold, C.gilt, 0.4, 0.7),
    params: {
      count: int('Craters', 1, 80, 14),
      minSize: num('Smallest', 0.01, 0.3, 0.001, 0.03),
      maxSize: num('Largest', 0.02, 0.5, 0.001, 0.12),
      spread: num('Spread', 0.1, 1, 0.01, 0.85),
      rim: bool('Inner rim', true)
    }
  },
  fragments: {
    label: 'Fragments',
    group: 'marks',
    description: 'Particles scattered through it.',
    colors: { color: 'Fragments' },
    uses: { width: 'Outline width', filled: true },
    defaults: defaults(C.crimson, C.gilt, 0.9, 0.6, true),
    params: {
      count: int('Count', 1, 200, 26),
      spread: num('Spread', 0.05, 1, 0.01, 0.88),
      minSize: num('Smallest', 0.002, 0.1, 0.001, 0.01),
      sizeRange: num('Size range', 0, 0.2, 0.001, 0.015),
      shape: choice(
        'Shape',
        [
          ['dot', 'Dots'],
          ['square', 'Squares'],
          ['shard', 'Shards']
        ],
        'dot'
      ),
      place: choice(
        'Gathered',
        [
          ['everywhere', 'Everywhere'],
          ['core', 'Near the core'],
          ['edge', 'Near the edge']
        ],
        'everywhere'
      )
    }
  },
  cracks: {
    label: 'Cracks',
    group: 'marks',
    description: 'Jagged fractures running out from a point.',
    colors: { color: 'Cracks' },
    uses: { width: 'Line width', dash: true },
    defaults: defaults(C.gilt, C.gold, 0.6, 0.9),
    params: {
      count: int('Cracks', 1, 16, 5),
      length: num('Length', 0.1, 1.6, 0.01, 0.75),
      jagged: num('Jaggedness', 0, 1, 0.01, 0.5),
      branches: num('Branching', 0, 1, 0.01, 0.3),
      ox: num('Start across', -1, 1, 0.01, 0.2),
      oy: num('Start down', -1, 1, 0.01, -0.1)
    }
  },

  // ---------------------------------------------------------- interference
  noise: {
    label: 'Signal noise',
    group: 'interference',
    description: 'Broken bars across a band of the planet.',
    colors: { color: 'Bars', color2: 'Mixed in' },
    uses: { width: 'Outline width', filled: true },
    defaults: defaults(C.concrete, C.gilt, 0.55, 0.6, true),
    params: {
      bars: int('Bars', 1, 150, 34),
      center: num(
        'Band position',
        -1,
        1,
        0.01,
        0,
        'From the top (-1) to the bottom (1).'
      ),
      height: num('Band height', 0.05, 2, 0.01, 1),
      minWidth: num('Shortest bar', 0.01, 1, 0.005, 0.1),
      widthRange: num('Bar length range', 0, 1.5, 0.005, 0.35),
      minThick: num('Thinnest bar', 0.2, 10, 0.1, 1),
      thickRange: num('Thickness range', 0, 20, 0.1, 2.5),
      mix: num(
        'Mixed in',
        0,
        1,
        0.01,
        0.4,
        'How many bars take the second colour.'
      )
    }
  },
  redactions: {
    label: 'Redaction bars',
    group: 'interference',
    description: 'Solid bars striking part of it out.',
    colors: { color: 'Bars' },
    uses: { width: 'Outline width', filled: true },
    defaults: defaults(C.ink, C.gold, 1, 1, true),
    params: {
      bars: int('Bars', 1, 40, 7),
      start: num(
        'First bar',
        -1,
        1,
        0.01,
        0,
        'Where the first bar sits, from the top (-1) to the bottom (1).'
      ),
      spacing: num('Spacing', 0.02, 0.5, 0.005, 0.13),
      thickness: num('Thickness', 0.01, 0.4, 0.005, 0.07),
      inset: num('Inset', 0, 1, 0.01, 0.1),
      insetRange: num('Inset range', 0, 1, 0.01, 0.2),
      length: num('Length', 0.1, 2, 0.01, 1.2),
      lengthRange: num('Length range', 0, 1, 0.01, 0.5)
    }
  },
  missing: {
    label: 'Missing part',
    group: 'interference',
    description: 'A part of the planet gone.',
    colors: { color: 'Hole', color2: 'Edge' },
    uses: {},
    defaults: defaults(C.surface, C.gold, 1, 1, true),
    params: {
      shape: choice(
        'Shape',
        [
          ['circle', 'Circle'],
          ['wedge', 'Wedge'],
          ['ring', 'Ring']
        ],
        'circle'
      ),
      cx: num('Across', -1, 1, 0.01, 0.25),
      cy: num('Down', -1, 1, 0.01, -0.15),
      size: num('Size', 0.02, 1.2, 0.01, 0.45),
      angle: num('Wedge angle', 10, 360, 1, 90),
      ringWidth: num('Ring width', 0.05, 0.95, 0.01, 0.4),
      edge: bool('Edge', true),
      edgeOpacity: num('Edge opacity', 0, 1, 0.01, 0.25)
    }
  },
  glitch: {
    label: 'Glitch slices',
    group: 'interference',
    description: 'Strips of the planet shifted sideways.',
    colors: { color: 'Edges', color2: 'Slices' },
    uses: { width: 'Edge width' },
    defaults: defaults(C.gilt, C.surface, 0.6, 0.8, true),
    params: {
      slices: int('Slices', 1, 24, 6),
      minHeight: num('Thinnest', 1, 40, 0.5, 3),
      heightRange: num('Height range', 0, 60, 0.5, 12),
      shift: num('Shift', 0, 0.6, 0.005, 0.12),
      cover: num(
        'Cover',
        0,
        1,
        0.01,
        0.85,
        'How much of what is beneath a slice hides.'
      )
    }
  },
  waves: {
    label: 'Wave rings',
    group: 'interference',
    description: "Rings rippling out from a point, Omun's pulse held still.",
    colors: { color: 'Rings' },
    uses: { width: 'Line width', dash: true },
    defaults: defaults(C.gilt, C.gold, 0.5, 0.8),
    params: {
      count: int('Rings', 1, 24, 5),
      start: num('First ring', 0.01, 0.9, 0.005, 0.12),
      spacing: num('Spacing', 0.01, 0.4, 0.005, 0.15),
      fade: num('Fade', 0, 1, 0.01, 0.6),
      ox: num('Across', -1, 1, 0.01, 0),
      oy: num('Down', -1, 1, 0.01, 0)
    }
  },
  spiral: {
    label: 'Spiral',
    group: 'interference',
    description: 'Arms winding out from the centre, a vortex.',
    colors: { color: 'Arms' },
    uses: { width: 'Line width', dash: true },
    defaults: defaults(C.gilt, C.gold, 0.45, 0.9),
    params: {
      arms: int('Arms', 1, 8, 3),
      turns: num('Turns', 0.2, 6, 0.05, 1.6),
      start: num('Starts at', 0, 0.6, 0.005, 0.04),
      end: num('Ends at', 0.1, 1, 0.01, 0.95),
      direction: choice(
        'Direction',
        [
          ['cw', 'Clockwise'],
          ['ccw', 'Anticlockwise']
        ],
        'cw'
      )
    }
  },

  // -------------------------------------------------------- beyond the edge
  ring: {
    label: 'Planetary ring',
    group: 'beyond',
    description: 'A ring round the planet, Saturn-style.',
    outside: true,
    colors: { color: 'Ring' },
    uses: { dash: true },
    defaults: defaults(C.gilt, C.gold, 0.55, 1),
    params: {
      radius: num('Outer edge', 1.05, 2.4, 0.01, 1.6),
      width: num('Width', 0.02, 0.9, 0.005, 0.34),
      bands: int('Bands', 1, 6, 3),
      gap: num('Gaps', 0, 0.8, 0.01, 0.3),
      flatness: num(
        'Openness',
        0.04,
        1,
        0.01,
        0.22,
        'How far the ring is tipped toward you.'
      ),
      place: choice(
        'Placed',
        [
          ['around', 'Around the planet'],
          ['behind', 'Behind it'],
          ['front', 'In front']
        ],
        'around'
      )
    }
  },
  moons: {
    label: 'Moons',
    group: 'beyond',
    description: 'Small bodies orbiting outside it.',
    outside: true,
    colors: { color: 'Moons', color2: 'Orbit' },
    uses: { width: 'Outline width' },
    defaults: defaults(C.gold, C.gilt, 0.9, 0.8, true),
    params: {
      count: int('Moons', 1, 6, 2),
      distance: num('Distance', 1.1, 2.4, 0.01, 1.5),
      minSize: num('Smallest', 0.02, 0.4, 0.005, 0.07),
      sizeRange: num('Size range', 0, 0.3, 0.005, 0.08),
      flatness: num('Orbit roundness', 0.1, 1, 0.01, 1),
      orbit: bool('Show the orbit', true),
      place: choice(
        'Placed',
        [
          ['front', 'In front'],
          ['behind', 'Behind']
        ],
        'front'
      )
    }
  }
} satisfies Record<string, LayerTypeDef>;

export type LayerType = keyof typeof LAYER_TYPES;
export const LAYER_TYPE_IDS = Object.keys(LAYER_TYPES) as [
  LayerType,
  ...LayerType[]
];

export function layerTypeDef(type: LayerType): LayerTypeDef {
  return LAYER_TYPES[type];
}

// ------------------------------------------------------------------ schemas

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'A colour is a hex code like #d2a961');
const unit = z.number().min(0).max(1);

export const motionSchema = z.object({
  kind: z.enum(MOTION_KINDS).default('none'),
  /** Seconds for one full cycle. */
  seconds: z.number().min(1).max(240).default(24),
  reverse: z.boolean().default(false)
});
export type Motion = z.infer<typeof motionSchema>;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * A layer's controls, with every value checked against its type: a
 * missing or broken one takes its default, and a number out of range is
 * brought back inside it. Lenient on purpose, so a planet saved by an older
 * or newer build still draws rather than failing whole.
 */
export function normalizeParams(type: LayerType, raw: unknown): LayerParams {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const out: LayerParams = {};
  for (const [key, def] of Object.entries(LAYER_TYPES[type].params) as Array<
    [string, ParamDef]
  >) {
    const value = source[key];
    switch (def.kind) {
      case 'number':
        out[key] =
          typeof value === 'number' && Number.isFinite(value)
            ? clamp(value, def.min, def.max)
            : def.default;
        break;
      case 'int':
        out[key] =
          typeof value === 'number' && Number.isFinite(value)
            ? clamp(Math.round(value), def.min, def.max)
            : def.default;
        break;
      case 'boolean':
        out[key] = typeof value === 'boolean' ? value : def.default;
        break;
      case 'choice':
        out[key] = def.options.some((option) => option.value === value)
          ? (value as string)
          : def.default;
        break;
      case 'list':
        out[key] = Array.isArray(value)
          ? value
              .filter(
                (n): n is number => typeof n === 'number' && Number.isFinite(n)
              )
              .slice(0, def.maxItems)
              .map((n) => clamp(n, def.min, def.max))
          : [...def.default];
        break;
    }
  }
  return out;
}

/** `count` positions spread evenly, the way the editor sets a list. */
export function evenList(
  def: Extract<ParamDef, { kind: 'list' }>,
  count: number
) {
  const n = clamp(Math.round(count), 0, def.maxItems);
  return Array.from({ length: n }, (_, i) =>
    def.signed
      ? Number((-def.spread + (2 * def.spread * (i + 0.5)) / n).toFixed(3))
      : Number(((def.spread * (i + 1)) / n).toFixed(3))
  );
}

export const layerSchema = z
  .object({
    id: z.string().min(1).max(40),
    type: z.enum(LAYER_TYPE_IDS),
    name: z.string().max(60).default(''),
    visible: z.boolean().default(true),
    locked: z.boolean().default(false),
    color: hex.optional(),
    color2: hex.optional(),
    opacity: unit.optional(),
    width: z.number().min(0.1).max(12).optional(),
    filled: z.boolean().optional(),
    dash: z.enum(DASHES).optional(),
    /** Offset from the centre, in radii. */
    x: z.number().min(-1.5).max(1.5).default(0),
    y: z.number().min(-1.5).max(1.5).default(0),
    scale: z.number().min(0.1).max(3).default(1),
    /** Degrees, about the planet's centre. */
    rotation: z.number().min(-360).max(360).default(0),
    blend: z.enum(BLENDS).default('normal'),
    seed: z.number().int().min(0).max(2147483647).default(1),
    motion: motionSchema.prefault({}),
    params: z.unknown().optional()
  })
  .transform((layer) => {
    const def = LAYER_TYPES[layer.type].defaults;
    return {
      ...layer,
      color: layer.color ?? def.color,
      color2: layer.color2 ?? def.color2,
      opacity: layer.opacity ?? def.opacity,
      width: layer.width ?? def.width,
      filled: layer.filled ?? def.filled,
      dash: layer.dash ?? def.dash,
      params: normalizeParams(layer.type, layer.params)
    };
  });
export type Layer = z.output<typeof layerSchema>;

export const surfaceSchema = z.object({
  kind: z.enum(SURFACE_KINDS).default('solid'),
  color: hex.default(C.surface),
  color2: hex.default(C.obsidian),
  /** Degrees: the direction the gradient runs. */
  angle: z.number().min(-360).max(360).default(90),
  /** How strong the grain is. */
  grain: unit.default(0.35)
});

export const rimSchema = z.object({
  color: hex.default(C.gilt),
  opacity: unit.default(0.5),
  width: z.number().min(0).max(8).default(1),
  double: z.boolean().default(false),
  dash: z.enum(DASHES).default('solid')
});

export const shadeSchema = z.object({
  color: hex.default(C.obsidian),
  /** How dark the far side goes. Kept faint, as everything on the site is. */
  strength: unit.default(0.62),
  /** Where across the planet the shade begins. */
  start: unit.default(0.35),
  /** Degrees: 0 darkens the right, 90 the bottom. */
  angle: z.number().min(-360).max(360).default(0)
});

export const planetSpecSchema = z
  .object({
    version: z.literal(1).default(1),
    surface: surfaceSchema.prefault({}),
    rim: rimSchema.prefault({}),
    shade: shadeSchema.prefault({}),
    layers: z.array(layerSchema).max(MAX_LAYERS).default([])
  })
  .refine(
    (spec) =>
      new Set(spec.layers.map((layer) => layer.id)).size === spec.layers.length,
    'Every layer needs its own id'
  );
export type PlanetSpec = z.output<typeof planetSpecSchema>;
export type PlanetSpecInput = z.input<typeof planetSpecSchema>;

/** Reads a planet, or says why it can't. */
export function parsePlanetSpec(raw: unknown) {
  return planetSpecSchema.safeParse(raw);
}

let counter = 0;
/** A layer id that won't clash inside one planet. */
export function newLayerId(): string {
  counter = (counter + 1) % 1679616;
  return `${Date.now().toString(36)}${counter.toString(36)}`;
}

/** A layer of a type with its defaults, ready to add to a planet. */
export function newLayer(type: LayerType, seed: number): Layer {
  return layerSchema.parse({ id: newLayerId(), type, seed });
}

/** A planet with nothing on it yet but its surface, rim and shade. */
export function blankPlanet(): PlanetSpec {
  return planetSpecSchema.parse({});
}
