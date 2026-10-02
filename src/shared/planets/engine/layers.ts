import { EMBLEMS } from './emblems';
import {
  DASH_PATTERN,
  R,
  TAU,
  at,
  circlePath,
  f1,
  halfEllipse,
  n4,
  polyline,
  type LayerArt,
  type Paint,
  type Part,
  type Point,
  type Shape
} from './geometry';
import { mulberry32 } from './random';
import type { Layer, LayerType } from './spec';

// What each layer type draws, from its controls and its seed.
//
// The ten the lore was designed with (grid, veins, constellation, line of
// beings, signal noise, sigil, redaction bars, missing part, fragments and
// core) are the designs' own generators, written out again here step for
// step: the same random calls in the same order, the same rounding. With
// a preset's settings they draw exactly what the site drew before planets
// could be edited (presets.test.ts holds them to it).

const num = (layer: Layer, key: string) => layer.params[key] as number;
const flag = (layer: Layer, key: string) => layer.params[key] as boolean;
const pick = (layer: Layer, key: string) => layer.params[key] as string;
const list = (layer: Layer, key: string) => layer.params[key] as number[];

const circle = (cx: number, cy: number, r: number): Shape => ({
  t: 'circle',
  cx: n4(cx),
  cy: n4(cy),
  r: n4(r)
});

interface StrokeOptions {
  color?: string;
  /** Multiplies the layer's opacity. */
  opacity?: number;
  width?: number;
  round?: boolean;
  /** A pattern of its own, or null for none whatever the layer says. */
  dash?: string | null;
}

function stroke(layer: Layer, options: StrokeOptions = {}): Paint {
  const dash =
    options.dash === null
      ? undefined
      : (options.dash ?? DASH_PATTERN[layer.dash]);
  const round = options.round || layer.dash === 'dotted';
  return {
    fill: 'none',
    stroke: options.color ?? layer.color,
    strokeOpacity: layer.opacity * (options.opacity ?? 1),
    strokeWidth: options.width ?? layer.width,
    dash,
    cap: round ? 'round' : undefined,
    join: options.round ? 'round' : undefined
  };
}

function fill(layer: Layer, color = layer.color, opacity = 1): Paint {
  return { fill: color, fillOpacity: layer.opacity * opacity };
}

/** Filled or outlined, as the layer is set. */
function solid(layer: Layer, color = layer.color, opacity = 1): Paint {
  return layer.filled
    ? fill(layer, color, opacity)
    : stroke(layer, { color, opacity });
}

const only = (paint: Paint, shapes: Shape[]): Part[] =>
  shapes.length ? [{ paint, shapes }] : [];

// ------------------------------------------------------------- structure

function grid(layer: Layer): LayerArt {
  const tilt = (num(layer, 'tilt') * Math.PI) / 180;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const curve = num(layer, 'curve');
  const tilted = (x: number, y: number): Point => [
    R + x * cos - y * sin,
    R + x * sin + y * cos
  ];
  const loop = (point: (t: number) => Point) =>
    polyline(
      Array.from({ length: 97 }, (_, i) => point((i / 96) * Math.PI * 2))
    );
  const d = [
    ...list(layer, 'meridians').map((k) =>
      loop((t) => tilted(k * R * Math.cos(t), R * Math.sin(t)))
    ),
    ...list(layer, 'parallels').map((s) => {
      const y0 = s * R;
      const w = Math.sqrt(R * R - y0 * y0);
      return loop((t) => tilted(w * Math.cos(t), y0 + curve * w * Math.sin(t)));
    })
  ].join(' ');
  return { parts: d ? only(stroke(layer), [{ t: 'path', d }]) : [] };
}

function contours(layer: Layer): LayerArt {
  const random = mulberry32(layer.seed);
  const count = num(layer, 'count');
  const inner = num(layer, 'inner');
  const outer = Math.max(num(layer, 'outer'), inner);
  const waviness = num(layer, 'waviness');
  const lobes = num(layer, 'lobes');
  const phases = [random() * TAU, random() * TAU, random() * TAU];
  const d = Array.from({ length: count }, (_, i) => {
    const base =
      count === 1 ? outer : inner + ((outer - inner) * i) / (count - 1);
    const drift = random() * 0.6;
    const points = Array.from({ length: 121 }, (_, j) => {
      const t = (j / 120) * TAU;
      const wobble =
        Math.sin(lobes * t + phases[0] + drift) * 0.5 +
        Math.sin((lobes + 1) * t + phases[1]) * 0.3 +
        Math.sin((2 * lobes + 1) * t + phases[2] - drift) * 0.2;
      return at(R, R, base * R * (1 + waviness * 0.22 * wobble), t);
    });
    return polyline(points, true);
  }).join(' ');
  return { parts: only(stroke(layer, { round: true }), [{ t: 'path', d }]) };
}

function bands(layer: Layer): LayerArt {
  const random = mulberry32(layer.seed);
  const count = num(layer, 'count');
  const thick = num(layer, 'thickness') * R;
  const variation = num(layer, 'variation');
  const waviness = num(layer, 'waviness');
  const waves = num(layer, 'waves');
  const slot = (1.8 * R) / count;
  const shapes: Shape[] = Array.from({ length: count }, (_, i) => {
    const centre =
      R -
      0.9 * R +
      slot * (i + 0.5) +
      (random() - 0.5) * variation * slot * 0.6;
    const h = Math.max(0.6, thick * (1 + (random() - 0.5) * variation * 1.4));
    const phase = random() * TAU;
    const amp = waviness * (thick * 1.2 + 6);
    const top: Point[] = [];
    const bottom: Point[] = [];
    for (let j = 0; j <= 48; j++) {
      const x = -8 + (j / 48) * (2 * R + 16);
      const wave = Math.sin((x / (2 * R)) * waves * TAU + phase) * amp;
      top.push([x, centre - h / 2 + wave]);
      bottom.push([x, centre + h / 2 + wave * 0.85]);
    }
    return { t: 'path', d: polyline([...top, ...bottom.reverse()], true) };
  });
  return { parts: only(solid(layer), shapes) };
}

/** A point on a flat grid, bent as if wrapped round a globe. */
function warp(u: number, v: number, curvature: number): Point {
  const rho = Math.hypot(u, v);
  if (rho < 1e-9 || curvature === 0) return [R + u * R, R + v * R];
  const bent = rho < 1 ? Math.sin((rho * Math.PI) / 2) : rho;
  const k = (curvature * bent + (1 - curvature) * rho) / rho;
  return [R + u * k * R, R + v * k * R];
}

function mesh(layer: Layer): LayerArt {
  const cell = num(layer, 'cell');
  const curvature = num(layer, 'curvature');
  const pattern = pick(layer, 'pattern');
  const segment = (a: Point, b: Point, steps: number) =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps;
      return warp(
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        curvature
      );
    });
  const paths: string[] = [];
  const reach = 1.25;

  if (pattern === 'hexagons') {
    const w = Math.sqrt(3) * cell;
    const rowStep = 1.5 * cell;
    for (
      let row = -Math.ceil(reach / rowStep);
      row <= Math.ceil(reach / rowStep);
      row++
    ) {
      for (
        let col = -Math.ceil(reach / w) - 1;
        col <= Math.ceil(reach / w) + 1;
        col++
      ) {
        const cx = col * w + (Math.abs(row) % 2 ? w / 2 : 0);
        const cy = row * rowStep;
        if (Math.hypot(cx, cy) > 1.1) continue;
        const corners = Array.from({ length: 7 }, (_, k): Point => {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          return [cx + cell * Math.cos(a), cy + cell * Math.sin(a)];
        });
        const points: Point[] = [];
        for (let k = 0; k < 6; k++)
          points.push(
            ...segment(corners[k], corners[k + 1], 3).slice(k ? 1 : 0)
          );
        paths.push(polyline(points, true));
      }
    }
  } else {
    const angles =
      pattern === 'triangles'
        ? [0, Math.PI / 3, (2 * Math.PI) / 3]
        : [0, Math.PI / 2];
    const spacing = pattern === 'triangles' ? cell * (Math.sqrt(3) / 2) : cell;
    for (const angle of angles) {
      const dir: Point = [Math.cos(angle), Math.sin(angle)];
      const normal: Point = [-dir[1], dir[0]];
      for (
        let k = -Math.ceil(reach / spacing);
        k <= Math.ceil(reach / spacing);
        k++
      ) {
        const o = k * spacing;
        const a: Point = [
          normal[0] * o - dir[0] * reach,
          normal[1] * o - dir[1] * reach
        ];
        const b: Point = [
          normal[0] * o + dir[0] * reach,
          normal[1] * o + dir[1] * reach
        ];
        paths.push(polyline(segment(a, b, 40)));
      }
    }
  }
  return { parts: only(stroke(layer), [{ t: 'path', d: paths.join(' ') }]) };
}

function scanlines(layer: Layer): LayerArt {
  const spacing = num(layer, 'spacing');
  const from = R - 1.5 * R;
  const to = R + 1.5 * R;
  const d: string[] = [];
  for (let y = from; y <= to; y += spacing)
    d.push(`M ${f1(from)} ${f1(y)} L ${f1(to)} ${f1(y)}`);
  return { parts: only(stroke(layer), [{ t: 'path', d: d.join(' ') }]) };
}

function halftone(layer: Layer): LayerArt {
  const spacing = num(layer, 'spacing');
  const size = num(layer, 'size');
  const fade = num(layer, 'fade');
  const direction = (num(layer, 'direction') * Math.PI) / 180;
  const dx = Math.cos(direction);
  const dy = Math.sin(direction);
  const shapes: Shape[] = [];
  for (let y = spacing / 2; y < 2 * R; y += spacing) {
    for (let x = spacing / 2; x < 2 * R; x += spacing) {
      const u = (x - R) / R;
      const v = (y - R) / R;
      if (u * u + v * v > 1.04) continue;
      const toward = (u * dx + v * dy + 1) / 2;
      const radius = ((size * spacing) / 2) * (1 - fade * toward);
      if (radius >= 0.15) shapes.push(circle(x, y, radius));
    }
  }
  return { parts: only(solid(layer), shapes) };
}

// --------------------------------------------------------------- network

function veins(layer: Layer): LayerArt {
  const random = mulberry32(layer.seed);
  const count = num(layer, 'count');
  const steps = num(layer, 'steps');
  const step = num(layer, 'step');
  const wander = num(layer, 'wander');
  const branching = num(layer, 'branching');
  const branchTurn = num(layer, 'branchTurn');
  const maxDepth = num(layer, 'depth');
  const branchLength = num(layer, 'branchLength');
  const reach = num(layer, 'reach');
  const jitter = num(layer, 'jitter');
  const curl = num(layer, 'curl');
  const taper = num(layer, 'taper');

  const out: Array<{ d: string; depth: number }> = [];
  const grow = (
    x: number,
    y: number,
    a: number,
    length: number,
    depth: number
  ) => {
    const points: Point[] = [[x, y]];
    for (let s = 0; s < length; s++) {
      a += (random() - 0.5) * wander;
      if (curl) a += curl;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      if (Math.hypot(x - R, y - R) > R * reach) break;
      points.push([x, y]);
      if (depth < maxDepth && random() < branching)
        grow(
          x,
          y,
          a + (random() < 0.5 ? branchTurn : -branchTurn),
          Math.floor(length * branchLength),
          depth + 1
        );
    }
    if (points.length > 1) out.push({ d: polyline(points), depth });
  };
  for (let i = 0; i < count; i++)
    grow(R, R, (i / count) * Math.PI * 2 + random() * jitter, steps, 0);

  if (!taper)
    return {
      parts: only(
        stroke(layer, { round: true }),
        out.map(({ d }): Shape => ({ t: 'path', d }))
      )
    };
  const depths = [...new Set(out.map((vein) => vein.depth))].sort(
    (a, b) => a - b
  );
  return {
    parts: depths.map((depth) => ({
      paint: stroke(layer, {
        round: true,
        width:
          layer.width * Math.max(0.15, 1 - (taper * depth) / (maxDepth + 1))
      }),
      shapes: out
        .filter((vein) => vein.depth === depth)
        .map(({ d }): Shape => ({ t: 'path', d }))
    }))
  };
}

function constellation(layer: Layer): LayerArt {
  const random = mulberry32(layer.seed);
  const spread = num(layer, 'spread');
  const link = num(layer, 'link');
  const dot = num(layer, 'dot');
  const bigDot = num(layer, 'bigDot');
  const bigEvery = num(layer, 'bigEvery');
  const points = Array.from({ length: num(layer, 'points') }, (): Point => {
    const a = random() * Math.PI * 2;
    const d = Math.sqrt(random()) * R * spread;
    return [R + d * Math.cos(a), R + d * Math.sin(a)];
  });
  const links: string[] = [];
  points.forEach((p, i) =>
    points.slice(i + 1).forEach((q) => {
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) < R * link)
        links.push(`M ${f1(p[0])} ${f1(p[1])} L ${f1(q[0])} ${f1(q[1])}`);
    })
  );
  return {
    parts: [
      ...(links.length
        ? only(
            stroke(layer, {
              color: layer.color2,
              opacity: num(layer, 'linkOpacity')
            }),
            [{ t: 'path', d: links.join(' ') }]
          )
        : []),
      ...only(
        fill(layer),
        points.map(([x, y], i) =>
          circle(
            Number(f1(x)),
            Number(f1(y)),
            R * (bigEvery && i % bigEvery === 0 ? bigDot : dot)
          )
        )
      )
    ]
  };
}

function beings(layer: Layer): LayerArt {
  const count = num(layer, 'count');
  const distance = num(layer, 'distance');
  const loop = pick(layer, 'loop');
  const points = Array.from({ length: count }, (_, i): Point => {
    const a = (i / count) * Math.PI * 2;
    return [R + R * distance * Math.cos(a), R + R * distance * Math.sin(a)];
  });
  return {
    parts: [
      ...(loop === 'none'
        ? []
        : only(stroke(layer, { opacity: num(layer, 'lineOpacity') }), [
            { t: 'path', d: polyline(points, loop === 'closed') }
          ])),
      ...only(
        fill(layer, layer.color2),
        points.map(([x, y]) =>
          circle(Number(f1(x)), Number(f1(y)), R * num(layer, 'dot'))
        )
      )
    ]
  };
}

function orbits(layer: Layer): LayerArt {
  const random = mulberry32(layer.seed);
  const count = num(layer, 'count');
  const inner = num(layer, 'inner');
  const outer = Math.max(num(layer, 'outer'), inner);
  const flatness = num(layer, 'flatness');
  const ellipses: Shape[] = [];
  const bodies: Shape[] = [];
  for (let i = 0; i < count; i++) {
    const rx =
      (count === 1 ? outer : inner + ((outer - inner) * i) / (count - 1)) * R;
    const ry = rx * flatness;
    ellipses.push({ t: 'ellipse', cx: R, cy: R, rx: n4(rx), ry: n4(ry) });
    for (let b = 0; b < num(layer, 'bodies'); b++) {
      const a = random() * TAU;
      bodies.push(
        circle(
          R + rx * Math.cos(a),
          R + ry * Math.sin(a),
          num(layer, 'bodySize') * R
        )
      );
    }
  }
  return {
    parts: [
      ...only(stroke(layer), ellipses),
      ...only(fill(layer, layer.color2), bodies)
    ]
  };
}

function circuits(layer: Layer): LayerArt {
  const random = mulberry32(layer.seed);
  const length = num(layer, 'length') * R;
  const node = num(layer, 'node') * R;
  const spread = num(layer, 'spread');
  const paths: string[] = [];
  const nodes: Shape[] = [];
  for (let t = 0; t < num(layer, 'traces'); t++) {
    const a = random() * TAU;
    const d = Math.sqrt(random()) * R * spread;
    let [x, y] = at(R, R, d, a);
    let across = random() < 0.5;
    const points: Point[] = [[x, y]];
    for (let s = 0; s < num(layer, 'segments'); s++) {
      const step = length * (0.5 + random()) * (random() < 0.5 ? -1 : 1);
      if (across) x += step;
      else y += step;
      across = !across;
      points.push([x, y]);
    }
    paths.push(polyline(points));
    if (node > 0) {
      nodes.push(circle(points[0][0], points[0][1], node * 0.6));
      nodes.push(circle(x, y, node));
    }
  }
  return {
    parts: [
      ...only({ ...stroke(layer), join: 'miter' }, [
        { t: 'path', d: paths.join(' ') }
      ]),
      ...only(fill(layer, layer.color2), nodes)
    ]
  };
}

// ----------------------------------------------------------------- marks

function core(layer: Layer): LayerArt {
  const size = num(layer, 'size') * R;
  const parts: Part[] = [];
  switch (pick(layer, 'shape')) {
    case 'ring':
      parts.push(...only(stroke(layer, { dash: null }), [circle(R, R, size)]));
      break;
    case 'double':
      parts.push(
        ...only(stroke(layer, { dash: null }), [
          circle(R, R, size),
          circle(R, R, size * 1.7)
        ])
      );
      break;
    case 'diamond': {
      const s = size * 1.3;
      parts.push(
        ...only(fill(layer), [
          {
            t: 'path',
            d: polyline(
              [
                [R, R - s],
                [R + s, R],
                [R, R + s],
                [R - s, R]
              ],
              true
            )
          }
        ])
      );
      break;
    }
    default:
      parts.push(...only(fill(layer), [circle(R, R, size)]));
  }
  if (flag(layer, 'ring'))
    parts.push(
      ...only(
        stroke(layer, {
          color: layer.color2,
          opacity: num(layer, 'ringOpacity'),
          dash: null
        }),
        [circle(R, R, num(layer, 'ringSize') * R)]
      )
    );
  return { parts };
}

function sigil(layer: Layer): LayerArt {
  const n = num(layer, 'points');
  const outer = num(layer, 'outer') * R;
  const inner = num(layer, 'inner') * R;
  const star = Array.from({ length: n * 2 }, (_, j): Point => {
    const angle = -Math.PI / 2 + (j * Math.PI) / n;
    const radius = j % 2 ? inner : outer;
    return [R + radius * Math.cos(angle), R + radius * Math.sin(angle)];
  });
  return {
    parts: [
      ...only(stroke(layer), [{ t: 'path', d: polyline(star, true) }]),
      ...(flag(layer, 'ring')
        ? only(stroke(layer, { opacity: num(layer, 'ringOpacity') }), [
            circle(R, R, outer * num(layer, 'ringSize'))
          ])
        : []),
      ...(flag(layer, 'eye')
        ? only(stroke(layer), [circle(R, R, num(layer, 'eyeSize') * R)])
        : [])
    ]
  };
}

function emblem(layer: Layer): LayerArt {
  const shape = EMBLEMS[pick(layer, 'emblem') === 'sigil' ? 'sigil' : 'vortex'];
  const width = num(layer, 'size') * R;
  const k = width / Math.max(shape.width, shape.height);
  const x = R - (shape.width * k) / 2;
  const y = R - (shape.height * k) / 2;
  const paint = layer.filled
    ? fill(layer)
    : stroke(layer, { width: layer.width / k, round: true });
  return {
    parts: only(paint, [
      {
        t: 'path',
        d: shape.d,
        transform: `translate(${n4(x)} ${n4(y)}) scale(${n4(k)})`
      }
    ])
  };
}

function dial(layer: Layer): LayerArt {
  const radius = num(layer, 'radius') * R;
  const ticks = num(layer, 'ticks');
  const majorEvery = num(layer, 'majorEvery');
  const d = Array.from({ length: ticks }, (_, i) => {
    const a = (i / ticks) * TAU - Math.PI / 2;
    const length =
      (majorEvery && i % majorEvery === 0
        ? num(layer, 'majorLength')
        : num(layer, 'length')) * R;
    const [x1, y1] = at(R, R, radius, a);
    const [x2, y2] = at(R, R, radius - length, a);
    return `M ${f1(x1)} ${f1(y1)} L ${f1(x2)} ${f1(y2)}`;
  }).join(' ');
  return {
    parts: [
      ...only(stroke(layer, { dash: null }), [{ t: 'path', d }]),
      ...(flag(layer, 'ring')
        ? only(stroke(layer, { dash: null }), [circle(R, R, radius)])
        : [])
    ]
  };
}

function craters(layer: Layer): LayerArt {
  const random = mulberry32(layer.seed);
  const min = num(layer, 'minSize');
  const max = Math.max(num(layer, 'maxSize'), min);
  const shapes: Shape[] = [];
  const rims: Shape[] = [];
  for (let i = 0; i < num(layer, 'count'); i++) {
    const a = random() * TAU;
    const d = Math.sqrt(random()) * R * num(layer, 'spread');
    const size = (min + random() * (max - min)) * R;
    const [x, y] = at(R, R, d, a);
    shapes.push(circle(x, y, size));
    if (flag(layer, 'rim'))
      rims.push(circle(x + size * 0.22, y + size * 0.22, size * 0.72));
  }
  return {
    parts: [
      ...only(solid(layer), shapes),
      ...only(stroke(layer, { color: layer.color2, opacity: 0.6 }), rims)
    ]
  };
}

function fragments(layer: Layer): LayerArt {
  const random = mulberry32(layer.seed);
  const spread = num(layer, 'spread');
  const minSize = num(layer, 'minSize');
  const sizeRange = num(layer, 'sizeRange');
  const shape = pick(layer, 'shape');
  const place = pick(layer, 'place');
  const shapes = Array.from({ length: num(layer, 'count') }, (): Shape => {
    const a = random() * Math.PI * 2;
    const u = random();
    const reach =
      place === 'core'
        ? u * u
        : place === 'edge'
          ? Math.sqrt(Math.sqrt(u))
          : Math.sqrt(u);
    const d = reach * R * spread;
    const x = R + d * Math.cos(a);
    const y = R + d * Math.sin(a);
    const size = R * (minSize + random() * sizeRange);
    if (shape === 'square')
      return {
        t: 'rect',
        x: n4(x - size),
        y: n4(y - size),
        w: n4(size * 2),
        h: n4(size * 2)
      };
    if (shape === 'shard') {
      const turn = random() * TAU;
      return {
        t: 'path',
        d: polyline(
          [
            at(x, y, size * 1.8, turn),
            at(x, y, size, turn + 2.3),
            at(x, y, size * 0.9, turn + 3.9)
          ],
          true
        )
      };
    }
    return circle(Number(f1(x)), Number(f1(y)), Number(f1(size)));
  });
  return { parts: only(solid(layer), shapes) };
}

function cracks(layer: Layer): LayerArt {
  const random = mulberry32(layer.seed);
  const jagged = num(layer, 'jagged');
  const branches = num(layer, 'branches');
  const ox = R + num(layer, 'ox') * R;
  const oy = R + num(layer, 'oy') * R;
  const paths: string[] = [];
  const crack = (
    x: number,
    y: number,
    a: number,
    length: number,
    depth: number
  ) => {
    const segments = Math.max(2, Math.round((length * R) / 10));
    const step = (length * R) / segments;
    const points: Point[] = [[x, y]];
    for (let s = 0; s < segments; s++) {
      a += (random() - 0.5) * jagged * 1.4;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      points.push([x, y]);
      if (depth < 2 && random() < branches * 0.35)
        crack(
          x,
          y,
          a + (random() < 0.5 ? 0.7 : -0.7),
          length * 0.45,
          depth + 1
        );
    }
    paths.push(polyline(points));
  };
  const count = num(layer, 'count');
  for (let i = 0; i < count; i++)
    crack(
      ox,
      oy,
      (i / count) * TAU + random() * 0.8,
      num(layer, 'length') * (0.6 + random() * 0.4),
      0
    );
  return {
    parts: only(stroke(layer, { round: true }), [
      { t: 'path', d: paths.join(' ') }
    ]),
    focus: [ox, oy]
  };
}

// ---------------------------------------------------------- interference

function noise(layer: Layer): LayerArt {
  const random = mulberry32(layer.seed);
  const top = R + num(layer, 'center') * R - (num(layer, 'height') * R) / 2;
  const span = num(layer, 'height') * R;
  const minWidth = num(layer, 'minWidth');
  const widthRange = num(layer, 'widthRange');
  const minThick = num(layer, 'minThick');
  const thickRange = num(layer, 'thickRange');
  const threshold = 1 - num(layer, 'mix');
  const bars = Array.from({ length: num(layer, 'bars') }, () => {
    const x = random() * 2 * R;
    const y = top + random() * span;
    const w = R * (minWidth + random() * widthRange);
    const h = minThick + random() * thickRange;
    return {
      shape: { t: 'rect', x: +f1(x), y: +f1(y), w: +f1(w), h: +f1(h) } as Shape,
      alt: random() >= threshold
    };
  });
  // In the order they fall, so where bars cross, the later one is on top.
  const parts: Part[] = [];
  let lastAlt: boolean | null = null;
  for (const bar of bars) {
    const last = parts.at(-1);
    if (last && bar.alt === lastAlt) last.shapes.push(bar.shape);
    else
      parts.push({
        paint: solid(layer, bar.alt ? layer.color2 : layer.color),
        shapes: [bar.shape]
      });
    lastAlt = bar.alt;
  }
  return { parts };
}

function redactions(layer: Layer): LayerArt {
  const random = mulberry32(layer.seed);
  const start = num(layer, 'start');
  const spacing = num(layer, 'spacing');
  const inset = num(layer, 'inset');
  const insetRange = num(layer, 'insetRange');
  const length = num(layer, 'length');
  const lengthRange = num(layer, 'lengthRange');
  const thickness = num(layer, 'thickness');
  const shapes = Array.from({ length: num(layer, 'bars') }, (_, i): Shape => ({
    t: 'rect',
    x: +f1(R * (inset + random() * insetRange)),
    y: +f1(R + start * R + i * R * spacing),
    w: +f1(R * (length + random() * lengthRange)),
    h: +f1(R * thickness)
  }));
  return { parts: only(solid(layer), shapes) };
}

function missing(layer: Layer): LayerArt {
  const cx = R + num(layer, 'cx') * R;
  const cy = R + num(layer, 'cy') * R;
  const size = num(layer, 'size') * R;
  const shape = pick(layer, 'shape');
  let hole: Shape;
  let edge: Shape;
  if (shape === 'wedge') {
    const span = (num(layer, 'angle') * Math.PI) / 180;
    const from = -Math.PI / 2 - span / 2;
    const [x1, y1] = at(cx, cy, size, from);
    const [x2, y2] = at(cx, cy, size, from + span);
    const large = span > Math.PI ? 1 : 0;
    const d =
      span >= TAU - 1e-6
        ? circlePath(cx, cy, size)
        : `M ${f1(cx)} ${f1(cy)} L ${f1(x1)} ${f1(y1)} A ${f1(size)} ${f1(size)} 0 ${large} 1 ${f1(x2)} ${f1(y2)} Z`;
    hole = { t: 'path', d };
    edge = hole;
  } else if (shape === 'ring') {
    const inner = size * (1 - num(layer, 'ringWidth'));
    hole = {
      t: 'path',
      d: `${circlePath(cx, cy, size)} ${circlePath(cx, cy, inner)}`,
      evenodd: true
    };
    edge = hole;
  } else {
    hole = circle(cx, cy, size);
    edge = hole;
  }
  return {
    parts: [
      ...only(fill(layer), [hole]),
      ...(flag(layer, 'edge')
        ? only(
            stroke(layer, {
              color: layer.color2,
              opacity: num(layer, 'edgeOpacity'),
              dash: '2 5',
              width: 1
            }),
            [edge]
          )
        : [])
    ],
    focus: [cx, cy]
  };
}

function glitch(layer: Layer): LayerArt {
  const random = mulberry32(layer.seed);
  const shift = num(layer, 'shift') * R;
  const masks: Shape[] = [];
  const edges: string[] = [];
  for (let i = 0; i < num(layer, 'slices'); i++) {
    const h = num(layer, 'minHeight') + random() * num(layer, 'heightRange');
    const y = random() * (2 * R - h);
    const off = (random() - 0.5) * 2 * shift;
    masks.push({ t: 'rect', x: 0, y: n4(y), w: 2 * R, h: n4(h) });
    edges.push(`M ${f1(off)} ${f1(y)} L ${f1(2 * R + off)} ${f1(y)}`);
    edges.push(`M ${f1(-off)} ${f1(y + h)} L ${f1(2 * R - off)} ${f1(y + h)}`);
    const x0 = random() * 2 * R;
    edges.push(
      `M ${f1(x0 + off)} ${f1(y + h / 2)} L ${f1(x0 + off + random() * 0.3 * R)} ${f1(y + h / 2)}`
    );
  }
  return {
    parts: [
      ...only({ fill: layer.color2, fillOpacity: num(layer, 'cover') }, masks),
      ...only(stroke(layer, { dash: null }), [
        { t: 'path', d: edges.join(' ') }
      ])
    ]
  };
}

function waves(layer: Layer): LayerArt {
  const count = num(layer, 'count');
  const cx = R + num(layer, 'ox') * R;
  const cy = R + num(layer, 'oy') * R;
  const fade = num(layer, 'fade');
  const parts = Array.from({ length: count }, (_, i): Part => ({
    paint: stroke(layer, { opacity: 1 - (fade * i) / count }),
    shapes: [
      circle(cx, cy, (num(layer, 'start') + i * num(layer, 'spacing')) * R)
    ]
  }));
  return { parts, focus: [cx, cy] };
}

function spiral(layer: Layer): LayerArt {
  const arms = num(layer, 'arms');
  const turns = num(layer, 'turns');
  const start = num(layer, 'start');
  const end = num(layer, 'end');
  const direction = pick(layer, 'direction') === 'ccw' ? -1 : 1;
  const steps = Math.max(24, Math.round(turns * 72));
  const d = Array.from({ length: arms }, (_, arm) => {
    const offset = (arm / arms) * TAU;
    return polyline(
      Array.from({ length: steps + 1 }, (_, j) => {
        const f = j / steps;
        return at(
          R,
          R,
          (start + (end - start) * f) * R,
          offset + direction * f * turns * TAU
        );
      })
    );
  }).join(' ');
  return { parts: only(stroke(layer, { round: true }), [{ t: 'path', d }]) };
}

// -------------------------------------------------------- beyond the edge

function ring(layer: Layer): LayerArt {
  const outer = num(layer, 'radius') * R;
  const bands = num(layer, 'bands');
  const bandWidth = (num(layer, 'width') * R) / bands;
  const flatness = num(layer, 'flatness');
  const place = pick(layer, 'place');
  const behind: Part[] = [];
  const front: Part[] = [];
  for (let k = 0; k < bands; k++) {
    const rx = outer - bandWidth * (k + 0.5);
    const ry = rx * flatness;
    const paint = stroke(layer, {
      width: Math.max(0.3, bandWidth * (1 - num(layer, 'gap')))
    });
    if (place === 'around') {
      behind.push({
        paint,
        shapes: [{ t: 'path', d: halfEllipse(R, R, rx, ry, 'upper') }]
      });
      front.push({
        paint,
        shapes: [{ t: 'path', d: halfEllipse(R, R, rx, ry, 'lower') }]
      });
    } else {
      (place === 'behind' ? behind : front).push({
        paint,
        shapes: [{ t: 'ellipse', cx: R, cy: R, rx: n4(rx), ry: n4(ry) }]
      });
    }
  }
  return { parts: [], behind, front, extent: num(layer, 'radius') + 0.02 };
}

function moons(layer: Layer): LayerArt {
  const random = mulberry32(layer.seed);
  const rx = num(layer, 'distance') * R;
  const ry = rx * num(layer, 'flatness');
  const bodies: Shape[] = [];
  for (let i = 0; i < num(layer, 'count'); i++) {
    const a = random() * TAU;
    const size =
      (num(layer, 'minSize') + random() * num(layer, 'sizeRange')) * R;
    bodies.push(circle(R + rx * Math.cos(a), R + ry * Math.sin(a), size));
  }
  const orbit: Part[] = flag(layer, 'orbit')
    ? [
        {
          paint: stroke(layer, {
            color: layer.color2,
            opacity: 0.35,
            width: 0.6,
            dash: '4 5'
          }),
          shapes: [{ t: 'ellipse', cx: R, cy: R, rx: n4(rx), ry: n4(ry) }]
        }
      ]
    : [];
  const moonParts = only(solid(layer), bodies);
  const behindPlanet = pick(layer, 'place') === 'behind';
  return {
    parts: [],
    behind: behindPlanet ? [...orbit, ...moonParts] : orbit,
    front: behindPlanet ? [] : moonParts,
    extent:
      num(layer, 'distance') +
      num(layer, 'minSize') +
      num(layer, 'sizeRange') +
      0.02
  };
}

export const GENERATORS: Record<LayerType, (layer: Layer) => LayerArt> = {
  grid,
  contours,
  bands,
  mesh,
  scanlines,
  halftone,
  veins,
  constellation,
  beings,
  orbits,
  circuits,
  core,
  sigil,
  emblem,
  dial,
  craters,
  fragments,
  cracks,
  noise,
  redactions,
  missing,
  glitch,
  waves,
  spiral,
  ring,
  moons
};
