import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import styles from './GenesisField.module.scss'

/** Normalised cursor position, -1..1 about the centre of the field. */
export interface PointerLean {
  x: number
  y: number
}

export interface GenesisFieldProps {
  /** Drives tint and motion: the singularity reports real archive health. */
  tone: 'nominal' | 'unstable'
  /**
   * Live cursor position, read every frame.
   *
   * A ref rather than a prop value: this drives a canvas, so it must not
   * re-render React on pointer move. The lean is damped inside the loop.
   */
  leanRef?: RefObject<PointerLean>
  className?: string
}

interface Star {
  /** Normalised to the box, so a resize does not scatter the field. */
  x: number
  y: number
  radius: number
  /** Parallax band, 0 (far) .. 1 (near). */
  depth: number
  phase: number
}

interface Infaller {
  /** Orbital radius as a fraction of the disc's outer edge. */
  radius: number
  angle: number
  /** Previous screen position, for the motion streak. */
  px: number
  py: number
  /** Vertical squash, so particles ride the disc plane rather than a sphere. */
  tilt: number
  brightness: number
}

interface Meteor {
  x: number
  y: number
  /** Direction, in normalised units per second. */
  vx: number
  vy: number
  /** Seconds elapsed since the streak lit. */
  age: number
  duration: number
  /** Seconds before the next one lights. Counts down while dormant. */
  cooldown: number
  length: number
}

interface Galaxy {
  x: number
  y: number
  radius: number
  /** Radians; each smudge is an ellipse seen at its own angle. */
  angle: number
  squash: number
  brightness: number
}

const GOLD = '210, 169, 97'
const GOLD_HOT = '227, 194, 134'
const CRIMSON = '196, 69, 58'
const CRIMSON_DEEP = '67, 18, 15'
const BRASS = '94, 71, 44'
const CONCRETE = '111, 102, 86'

const STAR_COUNT = 260
const INFALLER_COUNT = 190
const METEOR_COUNT = 3
const GALAXY_COUNT = 3

/** Soft blobs composing the nebula. Drawn once into an offscreen buffer. */
const NEBULA_BLOBS = 220

/**
 * How far the disc is squashed vertically. The reference boards view their
 * portals almost square-on, so this stays shallow — a steep tilt turns the
 * accretion disc into a hoop seen edge-on and loses the mandala reading.
 */
const DISC_TILT = 0.34

/** Fraction of the disc radius at which infalling matter is consumed. */
const HORIZON = 0.17

/**
 * Where the horizon sits vertically, as a fraction of the field's height.
 *
 * Exported because the mandala has to be centred on exactly this point. It was
 * previously duplicated as an approximate CSS padding, and two approximations
 * of the same number in different units is how the armature drifted off the
 * black hole it is supposed to enclose.
 */
export const FOCUS_Y = 0.44

/**
 * Cursor parallax, in CSS pixels at full deflection, per layer.
 *
 * The spread is the point. Everything moving by one amount is a pan, not
 * parallax; the singularity has to travel furthest and the star field least for
 * the scene to read as deep. These sit just past the mandala's own lean, so the
 * armature and the hole it encloses feel coupled without being welded.
 */
const LEAN = {
  stars: 7,
  galaxies: 4,
  nebula: 18,
  core: 34
} as const

function createStars(count: number): Star[] {
  return Array.from({ length: count }, () => {
    const depth = Math.random()
    return {
      x: Math.random(),
      y: Math.random(),
      radius: 0.3 + depth * 1.1,
      depth,
      phase: Math.random() * Math.PI * 2
    }
  })
}

function createInfallers(count: number): Infaller[] {
  return Array.from({ length: count }, () => ({
    // Biased outward: `sqrt` distributes points evenly over the annulus rather
    // than crowding them at the centre the way a flat random does.
    radius: HORIZON + Math.sqrt(Math.random()) * (1 - HORIZON),
    angle: Math.random() * Math.PI * 2,
    px: 0,
    py: 0,
    tilt: 0.82 + Math.random() * 0.36,
    brightness: 0.35 + Math.random() * 0.65
  }))
}

function resetMeteor(meteor: Meteor): void {
  // Enters from beyond the upper left or upper right and crosses downward,
  // spawned off-frame so the streak is already full length when it appears.
  const fromLeft = Math.random() < 0.5
  const speed = 0.5 + Math.random() * 0.42

  meteor.x = fromLeft ? -0.12 : 1.12
  meteor.y = Math.random() * 0.44
  meteor.vx = (fromLeft ? 1 : -1) * speed
  meteor.vy = speed * (0.22 + Math.random() * 0.3)
  meteor.age = 0
  meteor.duration = 1.5 / speed
  meteor.length = 0.07 + Math.random() * 0.1
  // Long, irregular gaps: a meteor is an event. One every few seconds reads as
  // a living sky, where a steady stream reads as rain.
  meteor.cooldown = 5 + Math.random() * 13
}

function createMeteors(count: number): Meteor[] {
  return Array.from({ length: count }, (_, index) => {
    const meteor: Meteor = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      age: 0,
      duration: 1,
      cooldown: 0,
      length: 0.1
    }
    resetMeteor(meteor)
    // Stagger the first appearances so all three do not arrive together.
    meteor.cooldown = 2 + index * 6 + Math.random() * 5
    return meteor
  })
}

function createGalaxies(count: number): Galaxy[] {
  // Placed by hand rather than at random: they have to stay clear of the
  // mandala and of the type band, and three fixed spots do that reliably.
  const spots = [
    { x: 0.13, y: 0.19 },
    { x: 0.86, y: 0.3 },
    { x: 0.74, y: 0.09 }
  ]

  return Array.from({ length: count }, (_, index) => ({
    x: spots[index % spots.length].x,
    y: spots[index % spots.length].y,
    radius: 0.018 + Math.random() * 0.016,
    angle: Math.random() * Math.PI,
    squash: 0.3 + Math.random() * 0.3,
    brightness: 0.5 + Math.random() * 0.5
  }))
}

/**
 * Paints the nebula once into an offscreen buffer.
 *
 * Hundreds of overlapping soft gradients is what makes gas look like gas, and
 * it is far too much to redraw every frame. Nothing about the cloud changes
 * shape, only its orientation — so it is rendered once and then rotated as a
 * single bitmap, which costs one textured quad per frame instead of 220
 * gradient fills.
 */
function paintNebula(size: number, unstable: boolean): HTMLCanvasElement {
  const buffer = document.createElement('canvas')
  buffer.width = size
  buffer.height = size

  const context = buffer.getContext('2d')
  if (!context) return buffer

  const centre = size / 2
  context.globalCompositeOperation = 'lighter'

  for (let i = 0; i < NEBULA_BLOBS; i += 1) {
    // Log-spiral placement: gas trails inward along the same arms the infalling
    // matter follows, so cloud and particles agree about the shape of the well.
    const t = i / NEBULA_BLOBS
    const arm = (i % 2) * Math.PI
    const angle = arm + t * Math.PI * 3.4 + (Math.random() - 0.5) * 0.9
    const distance = (0.16 + Math.pow(t, 0.7) * 0.84) * centre * 0.95

    const x = centre + Math.cos(angle) * distance
    const y = centre + Math.sin(angle) * distance * DISC_TILT * 2.1
    const radius = centre * (0.06 + Math.random() * 0.16)

    // Crimson in the hot inner region, brass and gold further out — the
    // temperature gradient of a real disc, expressed in the locked palette.
    const heat = 1 - distance / (centre * 0.95)
    const tint = unstable ? CRIMSON : heat > 0.62 ? CRIMSON : heat > 0.3 ? GOLD : BRASS
    const alpha = 0.014 + heat * 0.03

    const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, `rgba(${tint}, ${alpha.toFixed(4)})`)
    gradient.addColorStop(1, `rgba(${tint}, 0)`)

    context.fillStyle = gradient
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fill()
  }

  return buffer
}

/**
 * The singularity.
 *
 * A collapsing cloud drawn as one scene: a parallax star field, distant
 * galaxies, the occasional meteor, a planet lit by the disc it orbits, a nebula
 * wound into spiral arms, matter streaming inward along those arms, an
 * accretion disc beamed bright on its approaching limb, a photon ring, and at
 * the centre an event horizon that emits nothing at all.
 *
 * The dark centre is deliberate and is the point of the composition. The brief
 * asks for one focal ritual object in a vast symmetrical field; here that
 * object is an absence, with every other element — the arms, the disc, the
 * mandala layered over it — describing the shape of what is missing.
 *
 * All of it is Canvas 2D. The subject is light and gas, not geometry, so a 3D
 * pipeline would add a dependency and a depth buffer to solve a problem that is
 * really about compositing hundreds of soft gradients cheaply.
 */
export function GenesisField({ tone, leanRef, className }: GenesisFieldProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationsEnabled = useAnimationsEnabled()

  // The loop reads the tone every frame but must not be rebuilt when it
  // changes, so the value is mirrored into a ref and synced in an effect.
  const toneRef = useRef(tone)
  useEffect(() => {
    toneRef.current = tone
  }, [tone])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    const stars = createStars(STAR_COUNT)
    const infallers = createInfallers(INFALLER_COUNT)
    const meteors = createMeteors(METEOR_COUNT)
    const galaxies = createGalaxies(GALAXY_COUNT)

    let width = 0
    let height = 0
    let discRadius = 0
    let nebula: HTMLCanvasElement | null = null
    let nebulaTone: 'nominal' | 'unstable' | null = null

    // Damped cursor lean. Smoothed here rather than by a spring outside,
    // because the value has to be read per frame without touching React.
    let leanX = 0
    let leanY = 0

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      // Capped at 2: beyond that the fill rate triples on a 4K panel for
      // hairlines and soft gradients that gain nothing from it.
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      discRadius = Math.min(width * 0.29, height * 0.44)
      // The nebula buffer is sized to the disc, not the canvas, so a very wide
      // window does not quadruple the offscreen cost for no visible gain.
      nebula = paintNebula(Math.round(discRadius * 4), toneRef.current === 'unstable')
      nebulaTone = toneRef.current
    }

    resize()

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    let frame = 0
    let elapsed = 0
    let last = performance.now()

    const draw = (now: number): void => {
      if (width === 0 || height === 0) {
        if (animationsEnabled) frame = requestAnimationFrame(draw)
        return
      }

      const deltaSeconds = Math.min((now - last) / 1000, 0.05)
      last = now
      elapsed += deltaSeconds

      const unstable = toneRef.current === 'unstable'
      // The whole field cools and slows when the archive is unhealthy, so the
      // atmosphere reports system state rather than merely decorating.
      const intensity = unstable ? 0.5 : 1
      const speed = unstable ? 0.24 : 1

      // Ease toward the cursor. The rate is frame-rate independent, so the lag
      // feels the same at 60 and at 144Hz.
      const target = leanRef?.current
      if (target) {
        const ease = 1 - Math.exp(-deltaSeconds * 3.4)
        leanX += (target.x - leanX) * ease
        leanY += (target.y - leanY) * ease
      }

      // The nebula is tinted by state, so it is repainted only when that
      // actually changes — never per frame.
      if (nebulaTone !== toneRef.current) {
        nebula = paintNebula(Math.round(discRadius * 4), unstable)
        nebulaTone = toneRef.current
      }

      const baseX = width / 2
      const baseY = height * FOCUS_Y

      // Inverted, so the scene leans *away* from the cursor — which is how a
      // window onto something distant behaves when you move your head.
      const coreX = baseX - leanX * LEAN.core
      const coreY = baseY - leanY * LEAN.core * 0.7

      context.clearRect(0, 0, width, height)

      // ------------------------------------------------------------ star field

      const starDX = -leanX * LEAN.stars
      const starDY = -leanY * LEAN.stars * 0.7

      for (const star of stars) {
        // Near stars twinkle harder, drift faster and parallax more; far ones
        // sit almost still.
        const twinkle = 0.55 + Math.sin(elapsed * (0.5 + star.depth) + star.phase) * 0.45
        const drift = ((elapsed * (0.0016 + star.depth * 0.005)) % 1) * 0.03
        const alpha = (0.06 + star.depth * 0.34) * twinkle * intensity

        context.fillStyle = `rgba(${GOLD_HOT}, ${alpha.toFixed(4)})`
        context.beginPath()
        context.arc(
          ((star.x + drift) % 1) * width + starDX * star.depth,
          star.y * height + starDY * star.depth,
          star.radius,
          0,
          Math.PI * 2
        )
        context.fill()
      }

      // -------------------------------------------------------------- galaxies

      // Far-off smudges. Elliptical, so they read as other systems seen at an
      // angle rather than as out-of-focus stars.
      context.globalCompositeOperation = 'lighter'

      for (const galaxy of galaxies) {
        const gx = galaxy.x * width - leanX * LEAN.galaxies
        const gy = galaxy.y * height - leanY * LEAN.galaxies * 0.7
        const r = galaxy.radius * Math.min(width, height)
        const glow = galaxy.brightness * intensity

        context.save()
        context.translate(gx, gy)
        context.rotate(galaxy.angle)
        context.scale(1, galaxy.squash)

        const smudge = context.createRadialGradient(0, 0, 0, 0, 0, r)
        smudge.addColorStop(0, `rgba(${GOLD_HOT}, ${(0.1 * glow).toFixed(4)})`)
        smudge.addColorStop(0.45, `rgba(${GOLD}, ${(0.04 * glow).toFixed(4)})`)
        smudge.addColorStop(1, `rgba(${BRASS}, 0)`)
        context.fillStyle = smudge
        context.beginPath()
        context.arc(0, 0, r, 0, Math.PI * 2)
        context.fill()
        context.restore()
      }

      context.globalCompositeOperation = 'source-over'

      // ---------------------------------------------------------------- planet

      /*
       * A world in the middle distance, lit from the singularity.
       *
       * The terminator faces the disc rather than an arbitrary off-screen sun,
       * which is the detail that ties it into the scene: there is exactly one
       * light source here, and everything in frame should agree about where it
       * is.
       */
      const planetR = Math.min(width, height) * 0.032
      const planetX = width * 0.175 - leanX * LEAN.nebula * 0.8
      const planetY = height * 0.735 - leanY * LEAN.nebula * 0.6
      const toCore = Math.atan2(coreY - planetY, coreX - planetX)

      // Body: unlit rock, barely above the void.
      const body = context.createRadialGradient(planetX, planetY, 0, planetX, planetY, planetR)
      body.addColorStop(0, `rgba(${CONCRETE}, ${(0.12 * intensity).toFixed(3)})`)
      body.addColorStop(1, `rgba(20, 18, 18, ${(0.9 * intensity).toFixed(3)})`)
      context.fillStyle = body
      context.beginPath()
      context.arc(planetX, planetY, planetR, 0, Math.PI * 2)
      context.fill()

      // Lit limb: a crescent offset toward the disc, clipped to the body.
      context.save()
      context.beginPath()
      context.arc(planetX, planetY, planetR, 0, Math.PI * 2)
      context.clip()
      context.globalCompositeOperation = 'lighter'

      const litX = planetX + Math.cos(toCore) * planetR * 0.72
      const litY = planetY + Math.sin(toCore) * planetR * 0.72
      const limb = context.createRadialGradient(litX, litY, 0, litX, litY, planetR * 1.5)
      limb.addColorStop(0, `rgba(${GOLD_HOT}, ${(0.34 * intensity).toFixed(3)})`)
      limb.addColorStop(0.5, `rgba(${CRIMSON}, ${(0.1 * intensity).toFixed(3)})`)
      limb.addColorStop(1, `rgba(${CRIMSON_DEEP}, 0)`)
      context.fillStyle = limb
      context.fillRect(planetX - planetR, planetY - planetR, planetR * 2, planetR * 2)
      context.restore()
      context.globalCompositeOperation = 'source-over'

      // A thin ring, raked the same way as the accretion disc so the two agree
      // about the plane of this system.
      context.save()
      context.translate(planetX, planetY)
      context.rotate(-0.34)
      context.scale(1, 0.2)
      context.strokeStyle = `rgba(${GOLD}, ${(0.18 * intensity).toFixed(3)})`
      context.lineWidth = 1
      context.beginPath()
      context.arc(0, 0, planetR * 1.75, 0, Math.PI * 2)
      context.stroke()
      context.restore()

      // --------------------------------------------------------------- meteors

      context.globalCompositeOperation = 'lighter'

      for (const meteor of meteors) {
        if (animationsEnabled) {
          if (meteor.cooldown > 0) {
            meteor.cooldown -= deltaSeconds * speed
            continue
          }

          meteor.age += deltaSeconds * speed
          meteor.x += meteor.vx * deltaSeconds * speed
          meteor.y += meteor.vy * deltaSeconds * speed

          if (meteor.age > meteor.duration) {
            resetMeteor(meteor)
            continue
          }
        } else if (meteor.cooldown > 0) {
          continue
        }

        // Fades in and out across its life, so it never pops.
        const life = meteor.age / meteor.duration
        const fade = Math.sin(Math.min(life, 1) * Math.PI)

        const headX = meteor.x * width - leanX * LEAN.stars
        const headY = meteor.y * height - leanY * LEAN.stars * 0.7
        const magnitude = Math.hypot(meteor.vx, meteor.vy) || 1
        const tailX = headX - (meteor.vx / magnitude) * meteor.length * width
        const tailY = headY - (meteor.vy / magnitude) * meteor.length * width

        const trail = context.createLinearGradient(headX, headY, tailX, tailY)
        trail.addColorStop(0, `rgba(${GOLD_HOT}, ${(0.7 * fade * intensity).toFixed(4)})`)
        trail.addColorStop(0.4, `rgba(${GOLD}, ${(0.18 * fade * intensity).toFixed(4)})`)
        trail.addColorStop(1, `rgba(${GOLD}, 0)`)

        context.strokeStyle = trail
        context.lineWidth = 1.3
        context.lineCap = 'round'
        context.beginPath()
        context.moveTo(headX, headY)
        context.lineTo(tailX, tailY)
        context.stroke()
      }

      context.lineCap = 'butt'
      context.globalCompositeOperation = 'source-over'

      // ---------------------------------------------------------------- nebula

      if (nebula) {
        context.save()
        // Offset by its own lean rather than the core's, so the gas sits a
        // little behind the disc it feeds.
        context.translate(baseX - leanX * LEAN.nebula, baseY - leanY * LEAN.nebula * 0.7)
        context.rotate(elapsed * 0.012 * speed)
        context.globalCompositeOperation = 'lighter'
        context.globalAlpha = intensity
        const nebulaSize = discRadius * 4
        context.drawImage(nebula, -nebulaSize / 2, -nebulaSize / 2, nebulaSize, nebulaSize)
        context.restore()
        context.globalCompositeOperation = 'source-over'
        context.globalAlpha = 1
      }

      // -------------------------------------------------------- accretion disc

      context.save()
      context.translate(coreX, coreY)
      context.scale(1, DISC_TILT)
      context.globalCompositeOperation = 'lighter'

      /*
       * Doppler beaming: the side of the disc rotating toward the viewer is
       * brighter. A conic gradient is exactly the right primitive — it sweeps
       * hue and alpha around the axis in one fill, and rotating its start angle
       * with the disc keeps the hot side pinned to the approaching limb.
       */
      const beaming = context.createConicGradient(elapsed * 0.22 * speed, 0, 0)
      beaming.addColorStop(0, `rgba(${GOLD_HOT}, ${(0.3 * intensity).toFixed(3)})`)
      beaming.addColorStop(0.28, `rgba(${GOLD}, ${(0.1 * intensity).toFixed(3)})`)
      beaming.addColorStop(0.5, `rgba(${CRIMSON}, ${(0.05 * intensity).toFixed(3)})`)
      beaming.addColorStop(0.75, `rgba(${GOLD}, ${(0.09 * intensity).toFixed(3)})`)
      beaming.addColorStop(1, `rgba(${GOLD_HOT}, ${(0.3 * intensity).toFixed(3)})`)

      context.strokeStyle = beaming
      context.lineWidth = discRadius * 0.52
      context.beginPath()
      context.arc(0, 0, discRadius * 0.66, 0, Math.PI * 2)
      context.stroke()

      // Inner edge: the hottest material, closest to falling in.
      const innerGlow = context.createRadialGradient(
        0,
        0,
        discRadius * HORIZON,
        0,
        0,
        discRadius * 0.6
      )
      innerGlow.addColorStop(0, `rgba(${GOLD_HOT}, ${(0.24 * intensity).toFixed(3)})`)
      innerGlow.addColorStop(0.55, `rgba(${CRIMSON}, ${(0.1 * intensity).toFixed(3)})`)
      innerGlow.addColorStop(1, `rgba(${CRIMSON_DEEP}, 0)`)
      context.fillStyle = innerGlow
      context.beginPath()
      context.arc(0, 0, discRadius * 0.6, 0, Math.PI * 2)
      context.fill()

      context.restore()
      context.globalCompositeOperation = 'source-over'

      // ------------------------------------------------------ infalling matter

      context.globalCompositeOperation = 'lighter'

      for (const particle of infallers) {
        /*
         * Keplerian shear: angular velocity rises steeply as radius falls, so
         * the inner material laps the outer and the arms wind up on their own.
         * Hard-coding a spiral would look painted; this produces one.
         */
        const angularVelocity = 0.34 / Math.pow(Math.max(particle.radius, HORIZON), 1.5)

        if (animationsEnabled) {
          particle.angle += angularVelocity * deltaSeconds * speed
          // Inspiral rate also rises near the horizon — matter hesitates far
          // out and then goes quickly.
          particle.radius -= deltaSeconds * speed * (0.006 + 0.05 / (particle.radius * 40))

          if (particle.radius <= HORIZON) {
            particle.radius = 1
            particle.angle = Math.random() * Math.PI * 2
            particle.px = 0
          }
        }

        const r = particle.radius * discRadius
        const x = coreX + Math.cos(particle.angle) * r
        const y = coreY + Math.sin(particle.angle) * r * DISC_TILT * particle.tilt

        // A streak from the previous position, which is a free motion blur and
        // the thing that makes the orbit legible at these speeds.
        const hasPrevious = particle.px !== 0
        const heat = 1 - (particle.radius - HORIZON) / (1 - HORIZON)
        const alpha = particle.brightness * (0.1 + heat * 0.5) * intensity
        const tint = heat > 0.7 ? GOLD_HOT : heat > 0.35 ? GOLD : CRIMSON

        if (hasPrevious) {
          context.strokeStyle = `rgba(${tint}, ${alpha.toFixed(4)})`
          context.lineWidth = 0.5 + heat * 1.1
          context.beginPath()
          context.moveTo(particle.px, particle.py)
          context.lineTo(x, y)
          context.stroke()
        }

        particle.px = x
        particle.py = y
      }

      context.globalCompositeOperation = 'source-over'

      // ----------------------------------------------------------- the horizon

      /*
       * The photon ring, then the horizon itself.
       *
       * Order matters: the ring is drawn additively so it blooms against the
       * disc behind it, and the black disc is painted last so nothing bleeds
       * across the one part of the image that must emit nothing.
       */
      context.globalCompositeOperation = 'lighter'
      const ringRadius = discRadius * (HORIZON + 0.035)
      const photon = context.createRadialGradient(
        coreX,
        coreY,
        ringRadius * 0.82,
        coreX,
        coreY,
        ringRadius * 1.5
      )
      photon.addColorStop(0, `rgba(${GOLD_HOT}, 0)`)
      photon.addColorStop(0.42, `rgba(${GOLD_HOT}, ${(0.5 * intensity).toFixed(3)})`)
      photon.addColorStop(1, `rgba(${GOLD}, 0)`)
      context.fillStyle = photon
      context.beginPath()
      context.arc(coreX, coreY, ringRadius * 1.5, 0, Math.PI * 2)
      context.fill()
      context.globalCompositeOperation = 'source-over'

      const horizonRadius = discRadius * HORIZON
      const well = context.createRadialGradient(
        coreX,
        coreY,
        horizonRadius * 0.6,
        coreX,
        coreY,
        horizonRadius
      )
      well.addColorStop(0, 'rgba(0, 0, 0, 1)')
      well.addColorStop(0.86, 'rgba(0, 0, 0, 1)')
      well.addColorStop(1, 'rgba(0, 0, 0, 0)')
      context.fillStyle = well
      context.beginPath()
      context.arc(coreX, coreY, horizonRadius, 0, Math.PI * 2)
      context.fill()

      if (animationsEnabled) frame = requestAnimationFrame(draw)
    }

    if (animationsEnabled) {
      frame = requestAnimationFrame(draw)
    } else {
      // Reduced motion: one composed frame, so the scene still reads as
      // intended rather than as an empty box.
      draw(performance.now())
    }

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [animationsEnabled, leanRef])

  return (
    <canvas
      ref={canvasRef}
      className={[styles.field, className ?? ''].filter(Boolean).join(' ')}
      aria-hidden="true"
    />
  )
}
