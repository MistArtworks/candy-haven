import { PLANET_R } from './spec';

// The shapes a planet is drawn with, kept as plain data so any renderer
// can draw them (React here, and in Candy Haven). Coordinates are in the
// planet's own 355 box, centre (177.5, 177.5).

export const R = PLANET_R;
export const TAU = Math.PI * 2;

/** One decimal: path coordinates, as the designs' generators wrote them. */
export const f1 = (n: number) => n.toFixed(1);

/** Four decimals: enough for any size, without floating-point dust. */
export const n4 = (n: number) => Math.round(n * 1e4) / 1e4;

export type Point = readonly [number, number];

export type Shape =
  | { t: 'path'; d: string; transform?: string; evenodd?: boolean }
  | { t: 'circle'; cx: number; cy: number; r: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number }
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number };

/** How a group of shapes is painted. Opacities already include the layer's. */
export interface Paint {
  fill: string;
  fillOpacity?: number;
  stroke?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
  dash?: string;
  cap?: 'round' | 'butt' | 'square';
  join?: 'round' | 'miter' | 'bevel';
}

export interface Part {
  paint: Paint;
  shapes: Shape[];
}

/**
 * What one layer draws. Inside layers fill `parts`, clipped to the planet.
 * Layers beyond the edge split into what sits behind the planet and what
 * crosses in front of it, and say how far out they reach.
 */
export interface LayerArt {
  parts: Part[];
  behind?: Part[];
  front?: Part[];
  /** How far from the centre it reaches, in radii, before the layer's transform. */
  extent?: number;
  /** What it moves round, when not the planet's centre (a ripple's origin, say). */
  focus?: Point;
}

export const polyline = (points: readonly Point[], close = false) =>
  points.map(([x, y], i) => `${i ? 'L' : 'M'} ${f1(x)} ${f1(y)}`).join(' ') +
  (close ? ' Z' : '');

/** A point `radius` from (cx, cy), at `angle` radians. */
export const at = (
  cx: number,
  cy: number,
  radius: number,
  angle: number
): Point => [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];

/** The upper or lower half of an ellipse round (cx, cy). */
export function halfEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  half: 'upper' | 'lower'
) {
  return half === 'upper'
    ? `M ${f1(cx - rx)} ${f1(cy)} A ${f1(rx)} ${f1(ry)} 0 0 1 ${f1(cx + rx)} ${f1(cy)}`
    : `M ${f1(cx + rx)} ${f1(cy)} A ${f1(rx)} ${f1(ry)} 0 0 1 ${f1(cx - rx)} ${f1(cy)}`;
}

/** A closed circle as a path, for shapes that combine circles. */
export const circlePath = (cx: number, cy: number, r: number) =>
  `M ${f1(cx - r)} ${f1(cy)} A ${f1(r)} ${f1(r)} 0 1 0 ${f1(cx + r)} ${f1(cy)} A ${f1(r)} ${f1(r)} 0 1 0 ${f1(cx - r)} ${f1(cy)} Z`;

export const DASH_PATTERN = {
  solid: undefined,
  dashed: '4 5',
  dotted: '0.1 3.5'
} as const;
