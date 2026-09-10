import type { RefObject } from 'react'
import type { PointerLean } from '../GenesisField'

/**
 * Shared machinery for the NEXUS landing scenes.
 *
 * The landing shows one of four fields, chosen when the application starts.
 * They are different pictures of the same world, so they share a palette, a
 * camera, a star field and the scaffolding that drives them — this module is
 * that, and each scene is then only the part that makes it itself.
 *
 * ## Why the 3D is hand-rolled
 *
 * There is no 3D dependency in this project and these scenes did not justify
 * adding one. Three.js is several hundred kilobytes, a shader pipeline and a
 * context-loss path to handle, in exchange for depth sorting and lighting on
 * scenes that are mostly *soft light* — nebulae, dust, glowing seams. Canvas 2D
 * composites that far more directly, and a perspective divide is ten lines.
 *
 * So points live in world space, get rotated by the camera, translated down the
 * view axis and divided by depth. Depth then drives size and alpha, which is
 * what sells distance. Anything behind the lens is dropped, without which a
 * point just past it projects as an enormous smear.
 *
 * ## Two rules every scene here keeps
 *
 * **Nothing allocates per frame.** Pools are built on resize and mutated in
 * place. This runs behind the landing page for as long as the window is open.
 *
 * **`shadowBlur` is never used.** It is per-stroke and murderous at full
 * screen. Everything soft is a sprite pre-rendered once and stamped with
 * `drawImage`, which is a texture blit rather than a filter.
 */

export const TAU = Math.PI * 2

/**
 * The five materials, as `r, g, b` triples ready for `rgba()`.
 *
 * Sampled from the world brief, plus the two brighter crimsons the application
 * already uses for *light* — the brief's crimson glass is a material and is far
 * too dark to glow with. No sixth hue appears in any scene.
 */
export const RGB = {
  obsidian: '12, 12, 12',
  concrete: '111, 102, 86',
  brass: '94, 71, 44',
  gold: '151, 107, 48',
  goldLit: '210, 169, 97',
  goldHot: '227, 194, 134',
  crimsonGlass: '67, 18, 15',
  crimson: '163, 43, 35',
  crimsonHot: '196, 69, 58',
  alabaster: '182, 158, 124',
  alabasterLit: '221, 207, 178'
} as const

export type Material = keyof typeof RGB

/** `rgba()` from a material and an alpha, rounded to keep the string short. */
export function tint(material: Material, alpha: number): string {
  return `rgba(${RGB[material]}, ${alpha.toFixed(3)})`
}

// ------------------------------------------------------------------- geometry

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Projected {
  x: number
  y: number
  /** Perspective scale. Multiply a world size by this to get a screen size. */
  scale: number
  /** Distance down the view axis, for sorting and depth fades. */
  depth: number
}

/**
 * A camera, resolved once per frame.
 *
 * Built as a plain object rather than a class so a scene can hold one in a
 * closure and update its fields in place, which keeps the per-frame allocation
 * count at zero.
 */
export interface Camera {
  cosYaw: number
  sinYaw: number
  cosPitch: number
  sinPitch: number
  focal: number
  /** Screen position the view axis passes through. */
  originX: number
  originY: number
  /** Distance from the camera to the world origin. */
  distance: number
}

export function createCamera(): Camera {
  return {
    cosYaw: 1,
    sinYaw: 0,
    cosPitch: 1,
    sinPitch: 0,
    focal: 900,
    originX: 0,
    originY: 0,
    distance: 1500
  }
}

export function aimCamera(
  camera: Camera,
  options: {
    yaw: number
    pitch: number
    focal: number
    originX: number
    originY: number
    distance: number
  }
): void {
  camera.cosYaw = Math.cos(options.yaw)
  camera.sinYaw = Math.sin(options.yaw)
  camera.cosPitch = Math.cos(options.pitch)
  camera.sinPitch = Math.sin(options.pitch)
  camera.focal = options.focal
  camera.originX = options.originX
  camera.originY = options.originY
  camera.distance = options.distance
}

/**
 * World space to screen. Null for anything behind the lens.
 *
 * Writes into a caller-supplied `out` so a hot loop over a thousand points
 * allocates nothing — the returned object is that same one, reused.
 */
export function project(
  camera: Camera,
  x: number,
  y: number,
  z: number,
  out: Projected
): Projected | null {
  const rx = x * camera.cosYaw + z * camera.sinYaw
  const rz = -x * camera.sinYaw + z * camera.cosYaw
  const ry = y * camera.cosPitch - rz * camera.sinPitch
  const depth = y * camera.sinPitch + rz * camera.cosPitch + camera.distance

  if (depth <= 40) return null

  const scale = camera.focal / depth
  out.x = camera.originX + rx * scale
  out.y = camera.originY + ry * scale
  out.scale = scale
  out.depth = depth
  return out
}

/**
 * A point on a sphere, evenly distributed.
 *
 * `acos(1 - 2u)` rather than a uniform angle: picking latitude uniformly
 * bunches points at the poles, which shows up immediately as two bright knots.
 */
export function onSphere(radius: number): Vec3 {
  const theta = Math.random() * TAU
  const phi = Math.acos(1 - 2 * Math.random())

  return {
    x: radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.sin(phi) * Math.sin(theta),
    z: radius * Math.cos(phi)
  }
}

// -------------------------------------------------------------------- sprites

/**
 * A soft radial sprite, rendered once into its own canvas.
 *
 * Everything that glows in these scenes is one of these stamped with
 * `drawImage` and a `globalAlpha`. Building a gradient per sprite per frame —
 * there can be a hundred on screen — costs more than every other pass put
 * together, for an identical result.
 */
export function softSprite(
  size: number,
  material: Material,
  stops: [number, number][]
): HTMLCanvasElement {
  const tile = document.createElement('canvas')
  tile.width = size
  tile.height = size

  const context = tile.getContext('2d')
  if (!context) return tile

  const half = size / 2
  const gradient = context.createRadialGradient(half, half, 0, half, half, half)
  for (const [offset, alpha] of stops) gradient.addColorStop(offset, tint(material, alpha))

  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  return tile
}

/** Stamps a sprite centred on a point, at a screen size. */
export function stamp(
  context: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  x: number,
  y: number,
  size: number,
  alpha: number
): void {
  if (alpha <= 0.002 || size <= 0.4) return
  context.globalAlpha = Math.min(alpha, 1)
  context.drawImage(sprite, x - size / 2, y - size / 2, size, size)
}

// ---------------------------------------------------------------------- stars

export interface Star extends Vec3 {
  glow: number
  phase: number
}

export function createStarShell(count: number, near: number, far: number): Star[] {
  return Array.from({ length: count }, () => ({
    ...onSphere(near + Math.random() * (far - near)),
    glow: 0.25 + Math.random() * 0.75,
    phase: Math.random() * TAU
  }))
}

/**
 * The star field, twinkling.
 *
 * Shared by every scene so the four look like views of one sky rather than four
 * unrelated pictures.
 */
export function drawStars(
  context: CanvasRenderingContext2D,
  camera: Camera,
  stars: readonly Star[],
  sprite: HTMLCanvasElement,
  elapsed: number,
  intensity: number,
  scratch: Projected
): void {
  for (const star of stars) {
    const p = project(camera, star.x, star.y, star.z, scratch)
    if (!p) continue

    const twinkle = 0.55 + Math.sin(elapsed * 0.7 + star.phase) * 0.45
    stamp(
      context,
      sprite,
      p.x,
      p.y,
      Math.max(sprite.width * p.scale * 0.55, 1),
      star.glow * twinkle * 0.5 * intensity
    )
  }

  context.globalAlpha = 1
}

// ----------------------------------------------------------------- the plexus

export interface PlexusNode extends Vec3 {
  glow: number
  phase: number
  /** Filled each frame; `scale` of 0 means the node is behind the lens. */
  screenX: number
  screenY: number
  screenScale: number
}

export function createPlexus(count: number, place: () => Vec3): PlexusNode[] {
  return Array.from({ length: count }, () => ({
    ...place(),
    glow: 0.4 + Math.random() * 0.6,
    phase: Math.random() * TAU,
    screenX: 0,
    screenY: 0,
    screenScale: 0
  }))
}

/**
 * Nodes joined where they are close, and the lore's one visual claim.
 *
 * Everything in this world shares an underlying resonance; the plexus is that,
 * drawn. It appears in every scene for that reason rather than as decoration.
 *
 * Connections are tested in **world** space, not on screen. Joining by screen
 * distance links things that are nowhere near each other and merely overlap
 * from this angle, which is exactly what makes a plexus read as flat.
 */
export function drawPlexus(
  context: CanvasRenderingContext2D,
  camera: Camera,
  nodes: PlexusNode[],
  sprite: HTMLCanvasElement,
  options: {
    reach: number
    elapsed: number
    intensity: number
    line: Material
    node: Material
    /** Multiplies every alpha, for scenes where the plexus is a background. */
    strength?: number
    scratch: Projected
  }
): void {
  const { reach, elapsed, intensity, scratch } = options
  const strength = options.strength ?? 1
  const reachSquared = reach * reach

  for (const node of nodes) {
    const wobble = 1 + 0.07 * Math.sin(elapsed * 0.4 + node.phase)
    const p = project(camera, node.x * wobble, node.y * wobble, node.z * wobble, scratch)
    if (p) {
      node.screenX = p.x
      node.screenY = p.y
      node.screenScale = p.scale
    } else {
      node.screenScale = 0
    }
  }

  context.lineWidth = Math.max(camera.focal / 1500, 0.5)

  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i]
    if (a.screenScale === 0) continue

    for (let j = i + 1; j < nodes.length; j += 1) {
      const b = nodes[j]
      if (b.screenScale === 0) continue

      const dx = a.x - b.x
      const dy = a.y - b.y
      const dz = a.z - b.z
      const distance = dx * dx + dy * dy + dz * dz
      if (distance > reachSquared) continue

      // Fades to nothing at the threshold, so a link arrives and goes without
      // the flicker a hard cutoff produces.
      const closeness = 1 - distance / reachSquared
      context.strokeStyle = tint(options.line, closeness * closeness * 0.3 * intensity * strength)
      context.beginPath()
      context.moveTo(a.screenX, a.screenY)
      context.lineTo(b.screenX, b.screenY)
      context.stroke()
    }
  }

  for (const node of nodes) {
    if (node.screenScale === 0) continue
    const pulse = 0.6 + 0.4 * Math.sin(elapsed * 0.9 + node.phase)
    stamp(
      context,
      sprite,
      node.screenX,
      node.screenY,
      Math.max(sprite.width * node.screenScale * 0.8, 1.3),
      node.glow * pulse * 0.7 * intensity * strength
    )
  }

  context.globalAlpha = 1
}

// ----------------------------------------------------------------- the mount

export interface SceneFrame {
  context: CanvasRenderingContext2D
  width: number
  height: number
  /** Seconds since the scene mounted, scaled by the tone's speed. */
  elapsed: number
  delta: number
  /** Damped cursor lean, -1..1. Already eased; use it directly. */
  leanX: number
  leanY: number
  /** 1 when the archive is healthy, lower when it is not. */
  intensity: number
}

export interface SceneMount {
  animated: boolean
  leanRef?: RefObject<PointerLean>
  toneRef: RefObject<'nominal' | 'unstable'>
  /** Rebuild pools here. Called on mount and on every resize. */
  onResize: (width: number, height: number) => void
  onFrame: (frame: SceneFrame) => void
}

/**
 * Canvas sizing, the render loop, and the damped cursor lean.
 *
 * Every scene needs exactly this and none of it is interesting, so it lives
 * once. Returns a teardown for the effect that mounted it.
 *
 * The lean is eased *here* rather than by a spring outside, because it has to
 * be read every frame without touching React — a landing page that re-rendered
 * on pointer move would be a landing page that stuttered.
 */
export function mountScene(canvas: HTMLCanvasElement, options: SceneMount): () => void {
  const context = canvas.getContext('2d')
  if (!context) return () => {}

  let width = 0
  let height = 0
  let leanX = 0
  let leanY = 0
  let elapsed = 0
  let frame = 0
  let last = performance.now()

  const resize = (): void => {
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    // Capped at 2: beyond that the fill rate triples on a 4K panel, for soft
    // gradients that gain nothing from it.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    width = rect.width
    height = rect.height
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    context.setTransform(dpr, 0, 0, dpr, 0, 0)

    options.onResize(width, height)
  }

  resize()
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)

  const draw = (now: number): void => {
    if (width === 0 || height === 0) {
      if (options.animated) frame = requestAnimationFrame(draw)
      return
    }

    const unstable = options.toneRef.current === 'unstable'
    // The whole field cools and slows when the archive is unhealthy, so the
    // atmosphere reports system state rather than merely decorating.
    const intensity = unstable ? 0.5 : 1
    const speed = unstable ? 0.24 : 1

    const delta = Math.min((now - last) / 1000, 0.05) * speed
    last = now
    elapsed += delta

    // Frame-rate independent, so the lag feels the same at 60 and at 144Hz.
    const target = options.leanRef?.current
    if (target) {
      const ease = 1 - Math.exp(-delta * 3.4)
      leanX += (target.x - leanX) * ease
      leanY += (target.y - leanY) * ease
    }

    context.clearRect(0, 0, width, height)
    options.onFrame({ context, width, height, elapsed, delta, leanX, leanY, intensity })

    if (options.animated) frame = requestAnimationFrame(draw)
  }

  if (options.animated) frame = requestAnimationFrame(draw)
  else draw(performance.now())

  return () => {
    observer.disconnect()
    cancelAnimationFrame(frame)
  }
}
