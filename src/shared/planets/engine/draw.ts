import { R, n4, type LayerArt, type Part, type Point } from './geometry';
import { GENERATORS } from './layers';
import {
  LAYER_TYPES,
  PLANET_SIZE,
  type Blend,
  type Layer,
  type LayerType,
  type Motion,
  type PlanetSpec
} from './spec';

// A planet, worked out into what to draw and in what order:
//
//   1. what sits behind the planet (the back of a ring, moons behind it),
//   2. the surface and the inside layers, clipped to the circle,
//   3. the shade over them,
//   4. any core, above the shade, as the designs had it,
//   5. the rim,
//   6. what crosses in front (the front of a ring, moons in front).
//
// When anything reaches past the edge, the box grows to hold it, and the
// renderer fits the larger box into the same space, so the planet draws
// smaller rather than spilling over what's beside it.

export interface DrawnLayer {
  id: string;
  type: LayerType;
  art: LayerArt;
  /** The layer's offset, scale and rotation, or undefined when it has none. */
  transform?: string;
  blend?: Blend;
  motion?: Motion & { origin: Point };
  /** Drawn above the shade (the core). */
  aboveShade: boolean;
  outside: boolean;
}

export interface PlanetDrawing {
  spec: PlanetSpec;
  /** min-x, min-y, width, height of the box everything fits in. */
  viewBox: [number, number, number, number];
  /** The planet's circle against the box: 1 when nothing reaches past it. */
  discScale: number;
  layers: DrawnLayer[];
  /** Roughly how many shapes it takes to draw: what slows a phone down. */
  shapes: number;
}

function transformOf(layer: Layer): string | undefined {
  const steps: string[] = [];
  if (layer.x || layer.y)
    steps.push(`translate(${n4(layer.x * R)} ${n4(layer.y * R)})`);
  if (layer.rotation) steps.push(`rotate(${n4(layer.rotation)} ${R} ${R})`);
  if (layer.scale !== 1)
    steps.push(
      `translate(${R} ${R}) scale(${n4(layer.scale)}) translate(${-R} ${-R})`
    );
  return steps.length ? steps.join(' ') : undefined;
}

/** Path commands are counted a thirtieth each: long lines are cheap, not free. */
function costOf(parts: readonly Part[] | undefined) {
  let cost = 0;
  for (const part of parts ?? [])
    for (const shape of part.shapes)
      cost +=
        shape.t === 'path'
          ? 1 + Math.floor((shape.d.match(/[MLAZCSQT]/gi)?.length ?? 0) / 30)
          : 1;
  return cost;
}

const cache = new WeakMap<PlanetSpec, PlanetDrawing>();

export function drawPlanet(spec: PlanetSpec): PlanetDrawing {
  const known = cache.get(spec);
  if (known) return known;

  let reach = 1;
  let shapes = 0;
  const layers: DrawnLayer[] = [];
  for (const layer of spec.layers) {
    if (!layer.visible) continue;
    const def = LAYER_TYPES[layer.type];
    const art = GENERATORS[layer.type](layer);
    const outside = Boolean('outside' in def && def.outside);
    if (outside && art.extent)
      reach = Math.max(
        reach,
        art.extent * layer.scale + Math.hypot(layer.x, layer.y)
      );
    shapes += costOf(art.parts) + costOf(art.behind) + costOf(art.front);
    layers.push({
      id: layer.id,
      type: layer.type,
      art,
      transform: transformOf(layer),
      blend: layer.blend === 'normal' ? undefined : layer.blend,
      motion:
        layer.motion.kind === 'none'
          ? undefined
          : { ...layer.motion, origin: art.focus ?? [R, R] },
      aboveShade: layer.type === 'core',
      outside
    });
  }

  const margin = reach > 1 ? n4((reach - 1) * R + 2) : 0;
  const size = PLANET_SIZE + margin * 2;
  const drawing: PlanetDrawing = {
    spec,
    viewBox: margin ? [-margin, -margin, size, size] : [0, 0, size, size],
    discScale: PLANET_SIZE / size,
    layers,
    shapes
  };
  cache.set(spec, drawing);
  return drawing;
}
