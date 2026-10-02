import { useId, type CSSProperties, type ReactNode } from 'react';
import {
  DASH_PATTERN,
  PLANET_SIZE,
  R,
  drawPlanet,
  type DrawnLayer,
  type Paint,
  type Part,
  type PlanetSpec,
  type Shape
} from '../engine';

// Draws a planet from its spec, for the lore pages and for Candy Haven's
// editor alike, so what the editor shows is what visitors see.
//
// Motion is CSS: a layer that moves sits in a group running one of four
// keyframes (spin, pulse, flicker, drift) at its own speed, turning about
// its own centre. It stops for anyone who asks for reduced motion, for
// `still`, and wherever an ancestor carries `data-paused` (a planet out of
// view, or a look not currently shown).
//
// Shared with Candy Haven: this folder is copied there as it is (Haven's
// `npm run sync:planets`). Edit it here.

const MOTION_CSS = `
.nayara-motion{transform-box:view-box;animation-iteration-count:infinite;animation-timing-function:linear}
.nayara-spin{animation-name:nayara-spin}
.nayara-pulse{animation-name:nayara-pulse;animation-timing-function:ease-in-out}
.nayara-flicker{animation-name:nayara-flicker}
.nayara-drift{animation-name:nayara-drift;animation-timing-function:ease-in-out}
@keyframes nayara-spin{to{transform:rotate(360deg)}}
@keyframes nayara-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.07);opacity:.5}}
@keyframes nayara-flicker{0%,100%{opacity:1}7%{opacity:.25}9%{opacity:1}31%{opacity:.7}33%{opacity:1}58%{opacity:.15}61%{opacity:.9}83%{opacity:.5}85%{opacity:1}}
@keyframes nayara-drift{0%,100%{transform:translate(0,0)}25%{transform:translate(5px,-3px)}50%{transform:translate(1px,-6px)}75%{transform:translate(-4px,-2px)}}
@media (prefers-reduced-motion:reduce){.nayara-motion{animation:none!important}}
[data-paused] .nayara-motion{animation-play-state:paused}
`;

function paintProps(paint: Paint) {
  return {
    fill: paint.fill,
    fillOpacity: paint.fillOpacity,
    stroke: paint.stroke,
    strokeOpacity: paint.strokeOpacity,
    strokeWidth: paint.strokeWidth,
    strokeDasharray: paint.dash,
    strokeLinecap: paint.cap,
    strokeLinejoin: paint.join
  };
}

function ShapeElement({ shape }: { shape: Shape }): ReactNode {
  switch (shape.t) {
    case 'path':
      return (
        <path
          d={shape.d}
          transform={shape.transform}
          fillRule={shape.evenodd ? 'evenodd' : undefined}
        />
      );
    case 'circle':
      return <circle cx={shape.cx} cy={shape.cy} r={shape.r} />;
    case 'rect':
      return <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} />;
    case 'ellipse':
      return (
        <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} />
      );
  }
}

function Parts({ parts }: { parts: readonly Part[] }): ReactNode {
  return parts.map((part, i) => (
    <g key={i} {...paintProps(part.paint)}>
      {part.shapes.map((shape, j) => (
        <ShapeElement key={j} shape={shape} />
      ))}
    </g>
  ));
}

function LayerGroup({
  layer,
  parts,
  animated
}: {
  layer: DrawnLayer;
  parts: readonly Part[] | undefined;
  animated: boolean;
}): ReactNode {
  if (!parts?.length) return null;
  const { motion } = layer;
  const content = <Parts parts={parts} />;
  return (
    <g
      transform={layer.transform}
      style={layer.blend ? { mixBlendMode: layer.blend } : undefined}
      data-layer={layer.id}
    >
      {animated && motion ? (
        <g
          className={`nayara-motion nayara-${motion.kind}`}
          style={
            {
              transformOrigin: `${motion.origin[0]}px ${motion.origin[1]}px`,
              animationDuration: `${motion.seconds}s`,
              animationDirection: motion.reverse ? 'reverse' : 'normal'
            } as CSSProperties
          }
        >
          {content}
        </g>
      ) : (
        content
      )}
    </g>
  );
}

export interface PlanetGraphicProps {
  spec: PlanetSpec;
  /** A rendered image laid over the surface, under every layer. */
  render?: { src: string };
  /** Holds every layer still, whatever motion it has. */
  still?: boolean;
  /** Where it sits in the SVG around it; the planet's own box by default. */
  x?: number;
  y?: number;
  size?: number;
}

/**
 * A planet as an SVG fragment, for drawing inside another SVG (the lore's
 * crossfading looks). Anything beyond its edge widens its box, and the box
 * is fitted into `size`, so such a planet draws smaller in the same space.
 */
export function PlanetGraphic({
  spec,
  render,
  still = false,
  x = 0,
  y = 0,
  size = PLANET_SIZE
}: PlanetGraphicProps): ReactNode {
  const drawing = drawPlanet(spec);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ids = {
    clip: `${uid}-clip`,
    shade: `${uid}-shade`,
    surface: `${uid}-surface`,
    grain: `${uid}-grain`
  };
  const animated = !still && drawing.layers.some((layer) => layer.motion);
  const { surface, rim, shade } = spec;

  const shadeAngle = (shade.angle * Math.PI) / 180;
  const sx = Math.cos(shadeAngle) / 2;
  const sy = Math.sin(shadeAngle) / 2;
  const surfaceAngle = (surface.angle * Math.PI) / 180;
  const gx = Math.cos(surfaceAngle) / 2;
  const gy = Math.sin(surfaceAngle) / 2;

  const inside = drawing.layers.filter(
    (layer) => !layer.outside && !layer.aboveShade
  );
  const above = drawing.layers.filter(
    (layer) => !layer.outside && layer.aboveShade
  );
  const outside = drawing.layers.filter((layer) => layer.outside);
  const rimDash = DASH_PATTERN[rim.dash];

  return (
    <svg
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox={drawing.viewBox.join(' ')}
      overflow="visible"
    >
      {animated && <style>{MOTION_CSS}</style>}
      <defs>
        <clipPath id={ids.clip}>
          <circle cx={R} cy={R} r={R} />
        </clipPath>
        <linearGradient
          id={ids.shade}
          x1={0.5 - sx}
          y1={0.5 - sy}
          x2={0.5 + sx}
          y2={0.5 + sy}
        >
          <stop offset={shade.start} stopColor={shade.color} stopOpacity="0" />
          <stop
            offset="1"
            stopColor={shade.color}
            stopOpacity={shade.strength}
          />
        </linearGradient>
        {surface.kind === 'gradient' && (
          <linearGradient
            id={ids.surface}
            x1={0.5 - gx}
            y1={0.5 - gy}
            x2={0.5 + gx}
            y2={0.5 + gy}
          >
            <stop offset="0" stopColor={surface.color} />
            <stop offset="1" stopColor={surface.color2} />
          </linearGradient>
        )}
        {surface.kind === 'grain' && (
          <filter id={ids.grain} x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="2"
              stitchTiles="stitch"
              result="noise"
            />
            <feColorMatrix in="noise" type="luminanceToAlpha" result="specks" />
            <feComposite in="SourceGraphic" in2="specks" operator="in" />
          </filter>
        )}
      </defs>

      {outside.map((layer) => (
        <LayerGroup
          key={`${layer.id}-behind`}
          layer={layer}
          parts={layer.art.behind}
          animated={animated}
        />
      ))}

      <g clipPath={`url(#${ids.clip})`}>
        <circle
          cx={R}
          cy={R}
          r={R}
          fill={
            surface.kind === 'gradient' ? `url(#${ids.surface})` : surface.color
          }
        />
        {surface.kind === 'grain' && (
          <circle
            cx={R}
            cy={R}
            r={R}
            fill={surface.color2}
            filter={`url(#${ids.grain})`}
            opacity={surface.grain}
          />
        )}
        {render && (
          <image
            href={render.src}
            width={PLANET_SIZE}
            height={PLANET_SIZE}
            preserveAspectRatio="xMidYMid slice"
          />
        )}
        {inside.map((layer) => (
          <LayerGroup
            key={layer.id}
            layer={layer}
            parts={layer.art.parts}
            animated={animated}
          />
        ))}
        <rect
          width={PLANET_SIZE}
          height={PLANET_SIZE}
          fill={`url(#${ids.shade})`}
        />
      </g>

      {above.map((layer) => (
        <LayerGroup
          key={layer.id}
          layer={layer}
          parts={layer.art.parts}
          animated={animated}
        />
      ))}

      {rim.width > 0 && rim.opacity > 0 && (
        <circle
          cx={R}
          cy={R}
          r={R - 0.5}
          fill="none"
          stroke={rim.color}
          strokeOpacity={rim.opacity}
          strokeWidth={rim.width}
          strokeDasharray={rimDash}
        />
      )}
      {rim.double && rim.width > 0 && rim.opacity > 0 && (
        <circle
          cx={R}
          cy={R}
          r={R - 4.5}
          fill="none"
          stroke={rim.color}
          strokeOpacity={rim.opacity * 0.6}
          strokeWidth={rim.width * 0.7}
          strokeDasharray={rimDash}
        />
      )}

      {outside.map((layer) => (
        <LayerGroup
          key={`${layer.id}-front`}
          layer={layer}
          parts={layer.art.front}
          animated={animated}
        />
      ))}
    </svg>
  );
}

export interface PlanetSvgProps extends Omit<
  PlanetGraphicProps,
  'x' | 'y' | 'size'
> {
  className?: string;
  /** Read out to screen readers; without it the planet is decoration. */
  title?: string;
}

/** A planet on its own, as a complete SVG. */
export function PlanetSvg({
  className,
  title,
  ...graphic
}: PlanetSvgProps): ReactNode {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${PLANET_SIZE} ${PLANET_SIZE}`}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <PlanetGraphic {...graphic} />
    </svg>
  );
}
