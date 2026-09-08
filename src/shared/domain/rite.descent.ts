import type { SpinCommand } from './rite'

/**
 * THE DESCENT — the shaft, the gauntlet, and the physics that runs them.
 *
 * The third mechanism drops one mote per petition down a vertical shaft full of
 * obstacles and lets Nayara take the first one to reach it. Unlike the ring and
 * the rail, there is no closed-form answer for where a mote is at time `t`, so
 * this module simulates the whole descent once and bakes every position into a
 * flat array the renderers then sample. That is what keeps the console and the
 * broadcast identical, and what lets a browser source that connects halfway
 * through a descent jump straight to the right frame — the same guarantee
 * `spinFrameAt` gives the ring, bought a different way.
 *
 * ## How a real simulation lands on a result that was already decided
 *
 * The winner is drawn by a CSPRNG in the main process before anything moves,
 * and every mechanism is a presentation of that one draw. A physics sim cannot
 * be asked to agree with a number it has never seen, so something has to give.
 *
 * The physics does not. It runs unrigged, seeded only from the spin id, and
 * whichever mote reaches Nayara first genuinely earned it. What is chosen after
 * the fact is which *name was on that mote* — the assignment of petitions to
 * bodies is the degree of freedom, not the descent.
 *
 * This is the smallest possible lie and it is told in exactly the right place.
 * The alternative — searching seeds until the target's mote happens to win —
 * costs a sim per attempt for no visible gain, since the motes are
 * indistinguishable until they are labelled anyway.
 *
 * It is also, for once, precisely on-lore. This is a civilisation that decides
 * first and arranges the record to match: history rewritten through resonance,
 * a machine of peace that erased its own history. The descent is honest. The
 * paperwork is not.
 */

// --------------------------------------------------------------- coordinates

/*
 * The shaft.
 *
 * `x` and `z` span [-1, 1] across the shaft's mouth and `y` runs from 0 at the
 * release ports to 1 at Nayara's surface. Nothing here is in pixels: the
 * renderer scales the whole shaft to whatever frame it is given, so the course
 * reads the same on a 400px console preview and a 1080p broadcast.
 */

/** Where the shaft begins to close. */
const THROAT_TOP = 0.78
/** Where it has finished closing, above the aperture itself. */
const THROAT_BOTTOM = 0.96
/** The throat's radius once closed — three motes across, so it flows. */
const THROAT_RADIUS = 0.34

export const MOTE_RADIUS = 0.045

/**
 * The shaft's radius at a given depth.
 *
 * Constant down the gauntlet and then smoothstepped into the throat, because a
 * linear taper leaves a visible crease where the wall changes angle and motes
 * catch on it. The narrowing is what guarantees the descent terminates: no mote
 * can come to rest against a wall that is still closing beneath it, so the
 * queue at the throat always drains and someone always reaches Nayara.
 */
export function shaftRadius(y: number): number {
  if (y <= THROAT_TOP) return 1
  if (y >= THROAT_BOTTOM) return THROAT_RADIUS
  const u = (y - THROAT_TOP) / (THROAT_BOTTOM - THROAT_TOP)
  return 1 - (1 - THROAT_RADIUS) * u * u * (3 - 2 * u)
}

// ------------------------------------------------------------------- geometry

/** A static sphere in the lattice. */
export interface DescentPeg {
  x: number
  y: number
  z: number
  r: number
}

/** A pillar of the colonnade: a vertical capsule. */
export interface DescentPillar {
  x: number
  z: number
  top: number
  bottom: number
  r: number
}

/**
 * A rotating vane assembly — arms turning about the shaft's axis.
 *
 * Angle is a function of the *frame index*, never the wall clock, or the two
 * surfaces would compute different vane positions and the same mote would be
 * struck on one and miss on the other.
 */
export interface DescentVane {
  y: number
  arms: number
  /** Inner and outer reach, so the arms leave a gap at the axis to fall through. */
  inner: number
  outer: number
  r: number
  /** Turns per second, signed. */
  rate: number
  phase: number
}

export interface DescentCourse {
  pegs: readonly DescentPeg[]
  pillars: readonly DescentPillar[]
  vanes: readonly DescentVane[]
}

/** Vane arm angle at a baked frame. */
export function vaneAngle(vane: DescentVane, frame: number): number {
  return vane.phase + vane.rate * frame * (DESCENT_STEP_MS / 1000) * Math.PI * 2
}

/**
 * The gauntlet, built once at module load.
 *
 * Five zones, each of which fails a mote in a different way, because a course
 * made of one repeated obstacle is a probability distribution rather than
 * something worth watching:
 *
 *   1. `0.10 – 0.30`  the lattice — three layers of pegs on concentric rings,
 *                     each layer rotated off the last so no mote gets a clean
 *                     vertical corridor through all three.
 *   2. `0.38 – 0.50`  the vanes — two counter-turning arm assemblies. These are
 *                     the only moving parts, and the only obstacle that can add
 *                     energy to a mote rather than take it away.
 *   3. `0.54 – 0.72`  the colonnade — two rings of pillars. Long vertical
 *                     obstacles, so a mote can ride one down for a while
 *                     instead of being scattered off it.
 *   4. `0.76`         the scatter — a last tight peg ring directly above the
 *                     throat, to break up the queue before it forms.
 *   5. `0.78 – 1.00`  the throat — no obstacles at all. Everything that
 *                     survives converges here, which is what makes the ending
 *                     a crowd rather than a procession.
 *
 * Laid out with a golden-angle offset between layers rather than a fixed one:
 * a fixed rotation repeats, and any repeat in a peg lattice is a channel some
 * mote will find and fall straight through.
 */
export const DESCENT_COURSE: DescentCourse = (() => {
  const golden = Math.PI * (3 - Math.sqrt(5))
  const pegs: DescentPeg[] = []
  const pillars: DescentPillar[] = []

  const ring = (y: number, count: number, radius: number, offset: number, r: number): void => {
    for (let i = 0; i < count; i += 1) {
      const angle = offset + (i / count) * Math.PI * 2
      pegs.push({ x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius, r })
    }
  }

  // 1. The lattice.
  const layers = [0.1, 0.2, 0.3]
  layers.forEach((y, index) => {
    const offset = golden * index
    ring(y, 9, 0.74, offset, 0.05)
    ring(y, 5, 0.4, offset * 1.7 + 0.4, 0.05)
    // A peg on the axis every other layer: without it the middle of the shaft
    // is a free corridor, and a fifth of the motes never touch anything.
    if (index % 2 === 1) pegs.push({ x: 0, y, z: 0, r: 0.055 })
  })

  // 3. The colonnade.
  for (let i = 0; i < 8; i += 1) {
    const angle = golden * 4 + (i / 8) * Math.PI * 2
    pillars.push({
      x: Math.cos(angle) * 0.54,
      z: Math.sin(angle) * 0.54,
      top: 0.54,
      bottom: 0.72,
      r: 0.035
    })
  }
  for (let i = 0; i < 5; i += 1) {
    const angle = golden * 9 + (i / 5) * Math.PI * 2
    pillars.push({
      x: Math.cos(angle) * 0.88,
      z: Math.sin(angle) * 0.88,
      top: 0.58,
      bottom: 0.7,
      r: 0.03
    })
  }

  // 4. The scatter.
  ring(0.76, 6, 0.3, golden * 13, 0.042)
  ring(0.755, 3, 0.62, golden * 17, 0.042)

  // 2. The vanes.
  const vanes: DescentVane[] = [
    { y: 0.38, arms: 4, inner: 0.22, outer: 0.95, r: 0.032, rate: 0.19, phase: 0 },
    { y: 0.5, arms: 3, inner: 0.3, outer: 0.9, r: 0.032, rate: -0.26, phase: 1.1 }
  ]

  return { pegs, pillars, vanes }
})()

// ------------------------------------------------------------------- the sim

/** Baked frame interval. Playback is resampled onto the spin's own duration. */
export const DESCENT_STEP_MS = 1000 / 120

/** Integration substeps per baked frame, for stability at these radii. */
const SUBSTEPS = 3

/** Hard bound on the sim, so a pathological course can never hang a renderer. */
const MAX_FRAMES = 3600

/*
 * Tuning.
 *
 * Gravity is low and drag is high, which is a deliberate choice rather than a
 * fudge: a mote at terminal velocity crosses the shaft in a few seconds, so the
 * descent reads as a controlled lowering through a machine instead of a
 * handful of gravel dropped down a pipe. It also happens to be what the lore
 * says a resonance event does to everything inside it — movement slows
 * dramatically — and it keeps the whole field in flight at once, so every
 * petition is still visibly in the race when one is taken.
 */
const GRAVITY = 0.19
const DRAG = 0.42
const RESTITUTION = 0.36
/** How much tangential speed survives a contact. Below 1 so motes shed energy. */
const FRICTION = 0.88

/**
 * Omun — the shaft's own resonance, and the reason nothing in it can be still.
 *
 * A mote that lands dead on a peg's apex is balanced, and while that is
 * unstable in theory it persists indefinitely in fixed-point arithmetic: the
 * first tuning of this course had a lone mote sit on a peg for sixteen seconds
 * before dribbling off. Rather than special-case the stall, the shaft hums.
 *
 * Deterministic — derived from the frame index and the mote's own index, never
 * from a clock or a random source — so it perturbs both surfaces identically.
 * Two incommensurate frequencies, so the agitation never settles into a period
 * that could rock a whole layer of motes the same way at once.
 */
const RESONANCE = 0.075

/** How long the release takes overall, in frames, whatever the roster size. */
const RELEASE_WINDOW = 48

/** FNV-1a, so the release pattern is derived from the command and nothing else. */
function seedFrom(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** xorshift32 — small, deterministic, and adequate for scatter and shuffling. */
function random(seed: number): () => number {
  let state = seed || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 0x100000000
  }
}

export interface DescentPlan {
  /** Which petition each mote carries. Indexed by mote. */
  petitionOf: readonly number[]
  /** Which mote carries each petition. Indexed by petition. */
  moteOf: readonly number[]
  /** `frames × motes × 3` positions, in shaft coordinates. */
  path: Float32Array
  motes: number
  frames: number
  /** The mote Nayara took, and the frame it crossed on. */
  capturedMote: number
  capturedFrame: number
  /** The frame each mote is loosed on; before it, the mote is still in its port. */
  releaseFrame: readonly number[]
}

/**
 * The release pattern.
 *
 * A sunflower disc rather than a grid or a circle: it fills the shaft's mouth
 * evenly at any roster size, which a ring does not — nine motes on one ring
 * look deliberate, forty look like a fence. Jittered off the ideal position so
 * the opening frame does not read as a diagram.
 */
function releasePositions(count: number, rand: () => number): number[] {
  const golden = Math.PI * (3 - Math.sqrt(5))
  const out: number[] = []
  for (let i = 0; i < count; i += 1) {
    const radius = Math.sqrt((i + 0.5) / count) * 0.78
    const angle = golden * i
    out.push(
      Math.cos(angle) * radius + (rand() - 0.5) * 0.04,
      -0.04 - rand() * 0.03,
      Math.sin(angle) * radius + (rand() - 0.5) * 0.04
    )
  }
  return out
}

/**
 * Simulates the descent and bakes it.
 *
 * Deterministic in every respect: fixed timestep, seeded scatter, and vane
 * angles taken from the frame index rather than a clock. Two machines running
 * this on the same command get bit-identical paths.
 */
function simulate(spin: SpinCommand, count: number): Omit<DescentPlan, 'petitionOf' | 'moteOf'> {
  const rand = random(seedFrom(spin.id))
  const start = releasePositions(count, rand)
  // The ports open in sequence over a fixed window rather than at a fixed
  // interval, so two petitions and forty take the same time to loose. A fixed
  // interval made a full roster spend a second and a half releasing while the
  // first motes were already at the throat.
  const stride = Math.max(1, Math.round(RELEASE_WINDOW / count))
  const releaseFrame = Array.from({ length: count }, (_, i) => i * stride)

  const px = new Float64Array(count)
  const py = new Float64Array(count)
  const pz = new Float64Array(count)
  const vx = new Float64Array(count)
  const vy = new Float64Array(count)
  const vz = new Float64Array(count)
  const live = new Uint8Array(count)

  for (let i = 0; i < count; i += 1) {
    px[i] = start[i * 3]
    py[i] = start[i * 3 + 1]
    pz[i] = start[i * 3 + 2]
    // A whisper of initial drift, so two motes released from mirrored ports do
    // not fall as a mirrored pair for the whole lattice.
    vx[i] = (rand() - 0.5) * 0.05
    vz[i] = (rand() - 0.5) * 0.05
  }

  const { pegs, pillars, vanes } = DESCENT_COURSE
  const dt = DESCENT_STEP_MS / 1000 / SUBSTEPS

  // Grown rather than preallocated: the frame count is not known until a mote
  // reaches Nayara, and preallocating MAX_FRAMES for 48 motes would reserve
  // two megabytes to use a fifth of it.
  const frames: number[] = []
  let capturedMote = -1
  let capturedFrame = -1

  /** Resolves one mote against a sphere at `(cx, cy, cz)` of radius `cr`. */
  const hitSphere = (
    i: number,
    cx: number,
    cy: number,
    cz: number,
    cr: number,
    // Surface velocity at the contact, for the vanes. Static obstacles pass 0.
    sx: number,
    sy: number,
    sz: number
  ): void => {
    let dx = px[i] - cx
    let dy = py[i] - cy
    let dz = pz[i] - cz
    const reach = cr + MOTE_RADIUS
    const sq = dx * dx + dy * dy + dz * dz
    if (sq >= reach * reach) return

    let dist = Math.sqrt(sq)
    if (dist < 1e-9) {
      // Dead centre. Any direction is as valid as another; pick one rather than
      // dividing by zero and putting a NaN into the bake.
      dx = 1
      dy = 0
      dz = 0
      dist = 1
    }
    const nx = dx / dist
    const ny = dy / dist
    const nz = dz / dist

    px[i] = cx + nx * reach
    py[i] = cy + ny * reach
    pz[i] = cz + nz * reach

    // Reflect the velocity *relative* to the surface, then hand the surface's
    // own motion back. This is what lets a vane throw a mote instead of merely
    // stopping it.
    const rx = vx[i] - sx
    const ry = vy[i] - sy
    const rz = vz[i] - sz
    const normal = rx * nx + ry * ny + rz * nz
    if (normal >= 0) return

    const tx = rx - nx * normal
    const ty = ry - ny * normal
    const tz = rz - nz * normal
    const bounce = -normal * RESTITUTION
    vx[i] = tx * FRICTION + nx * bounce + sx
    vy[i] = ty * FRICTION + ny * bounce + sy
    vz[i] = tz * FRICTION + nz * bounce + sz
  }

  /** Resolves one mote against a capsule, by way of the nearest point on it. */
  const hitCapsule = (
    i: number,
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cr: number,
    spin3: readonly [number, number, number] | null
  ): void => {
    const ex = bx - ax
    const ey = by - ay
    const ez = bz - az
    const lengthSq = ex * ex + ey * ey + ez * ez
    let t = 0
    if (lengthSq > 1e-12) {
      t = ((px[i] - ax) * ex + (py[i] - ay) * ey + (pz[i] - az) * ez) / lengthSq
      t = t < 0 ? 0 : t > 1 ? 1 : t
    }
    const cx = ax + ex * t
    const cy = ay + ey * t
    const cz = az + ez * t
    if (spin3) {
      // ω × r, with ω about the shaft's vertical axis: the arm's surface is
      // moving faster the further out the contact is.
      const omega = spin3[0]
      hitSphere(i, cx, cy, cz, cr, -omega * cz, 0, omega * cx)
    } else {
      hitSphere(i, cx, cy, cz, cr, 0, 0, 0)
    }
  }

  for (let frame = 0; frame < MAX_FRAMES; frame += 1) {
    for (let sub = 0; sub < SUBSTEPS; sub += 1) {
      const at = frame + sub / SUBSTEPS

      for (let i = 0; i < count; i += 1) {
        if (frame < releaseFrame[i]) continue
        live[i] = 1

        vy[i] += GRAVITY * dt
        // The hum. See `RESONANCE`.
        vx[i] += Math.sin(at * 0.21 + i * 2.399) * RESONANCE * dt
        vz[i] += Math.cos(at * 0.13 + i * 1.723) * RESONANCE * dt

        const decay = 1 - DRAG * dt
        vx[i] *= decay
        vy[i] *= decay
        vz[i] *= decay
        px[i] += vx[i] * dt
        py[i] += vy[i] * dt
        pz[i] += vz[i] * dt
      }

      // Obstacles. Cheap rejection on `y` first: a mote is within reach of a
      // vanishing fraction of the course at any moment, and the alternative is
      // every mote against every peg on every substep.
      for (let i = 0; i < count; i += 1) {
        if (!live[i]) continue
        const y = py[i]

        for (const peg of pegs) {
          if (Math.abs(peg.y - y) > peg.r + MOTE_RADIUS) continue
          hitSphere(i, peg.x, peg.y, peg.z, peg.r, 0, 0, 0)
        }

        for (const pillar of pillars) {
          if (y < pillar.top - MOTE_RADIUS || y > pillar.bottom + MOTE_RADIUS) continue
          hitCapsule(
            i,
            pillar.x,
            pillar.top,
            pillar.z,
            pillar.x,
            pillar.bottom,
            pillar.z,
            pillar.r,
            null
          )
        }

        for (const vane of vanes) {
          if (Math.abs(vane.y - y) > vane.r + MOTE_RADIUS) continue
          const angle = vaneAngle(vane, at)
          const omega = vane.rate * Math.PI * 2
          for (let arm = 0; arm < vane.arms; arm += 1) {
            const a = angle + (arm / vane.arms) * Math.PI * 2
            const cos = Math.cos(a)
            const sin = Math.sin(a)
            hitCapsule(
              i,
              cos * vane.inner,
              vane.y,
              sin * vane.inner,
              cos * vane.outer,
              vane.y,
              sin * vane.outer,
              vane.r,
              [omega, 0, 0]
            )
          }
        }
      }

      // Mote against mote. Quadratic, but the roster is capped at 48, so this
      // is at worst 1128 pairs a substep — and without it the throat is a pile
      // of motes occupying the same point, which is the one place every eye is.
      for (let i = 0; i < count; i += 1) {
        if (!live[i]) continue
        for (let j = i + 1; j < count; j += 1) {
          if (!live[j]) continue
          const dx = px[j] - px[i]
          const dy = py[j] - py[i]
          const dz = pz[j] - pz[i]
          const reach = MOTE_RADIUS * 2
          const sq = dx * dx + dy * dy + dz * dz
          if (sq >= reach * reach || sq < 1e-12) continue

          const dist = Math.sqrt(sq)
          const nx = dx / dist
          const ny = dy / dist
          const nz = dz / dist
          const push = (reach - dist) * 0.5
          px[i] -= nx * push
          py[i] -= ny * push
          pz[i] -= nz * push
          px[j] += nx * push
          py[j] += ny * push
          pz[j] += nz * push

          const normal = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny + (vz[j] - vz[i]) * nz
          if (normal >= 0) continue
          const impulse = normal * (1 + RESTITUTION) * 0.5
          vx[i] += nx * impulse
          vy[i] += ny * impulse
          vz[i] += nz * impulse
          vx[j] -= nx * impulse
          vy[j] -= ny * impulse
          vz[j] -= nz * impulse
        }
      }

      /*
       * The shaft wall, and it has to be the last word of the substep.
       *
       * Radial only: the taper does the funnelling by itself, because a mote
       * pushed straight inward while gravity pulls it down slides along the
       * cone rather than sticking to it.
       *
       * Resolved after the mote-mote pass, not before. Forty-eight motes
       * queueing at the throat push each other hard enough that a pair
       * separation can shove one clean through a wall that was satisfied
       * earlier in the same substep — which put a mote outside the shaft on
       * screen with nothing to explain it.
       */
      for (let i = 0; i < count; i += 1) {
        if (!live[i]) continue
        const limit = shaftRadius(py[i]) - MOTE_RADIUS
        const rho = Math.hypot(px[i], pz[i])
        if (rho <= limit || rho <= 1e-9) continue

        const nx = px[i] / rho
        const nz = pz[i] / rho
        px[i] = nx * limit
        pz[i] = nz * limit
        const normal = vx[i] * nx + vz[i] * nz
        if (normal > 0) {
          vx[i] -= nx * normal * (1 + RESTITUTION)
          vz[i] -= nz * normal * (1 + RESTITUTION)
          vy[i] *= FRICTION
        }
      }
    }

    for (let i = 0; i < count; i += 1) {
      frames.push(px[i], py[i], pz[i])
    }

    if (capturedMote === -1) {
      // Nayara takes the first mote to break its surface. Ties broken by mote
      // index, which is arbitrary but has to be *something* deterministic.
      for (let i = 0; i < count; i += 1) {
        if (live[i] && py[i] >= 1) {
          capturedMote = i
          capturedFrame = frame
          break
        }
      }
      if (capturedMote !== -1) break
    }
  }

  if (capturedMote === -1) {
    /*
     * Unreachable while the throat still narrows, and handled anyway.
     *
     * The bake is what every renderer samples; leaving `capturedMote` at -1
     * would put a mechanism on screen that never resolves, which is worse on a
     * broadcast than an arbitrary but coherent answer. Whichever mote got
     * deepest is treated as taken.
     */
    let deepest = -1
    for (let i = 0; i < count; i += 1) {
      if (deepest === -1 || py[i] > py[deepest]) deepest = i
    }
    capturedMote = Math.max(deepest, 0)
    capturedFrame = Math.max(frames.length / (count * 3) - 1, 0)
  }

  return {
    path: new Float32Array(frames),
    motes: count,
    frames: frames.length / (count * 3),
    capturedMote,
    capturedFrame,
    releaseFrame
  }
}

/**
 * Assigns petitions to motes so the drawn winner rides the mote that won.
 *
 * The winner takes the captured mote; everything else is dealt out by a seeded
 * Fisher-Yates over the remaining ports. Reshuffled every spin on purpose — a
 * stable mapping would let a viewer learn that the mote from the third port
 * tends to win, and start reading the release instead of the descent.
 */
function assign(spin: SpinCommand, count: number, capturedMote: number): number[] {
  const petitionOf = new Array<number>(count).fill(-1)
  const target = Math.min(Math.max(spin.targetIndex, 0), count - 1)
  petitionOf[capturedMote] = target

  const rest: number[] = []
  for (let index = 0; index < count; index += 1) {
    if (index !== target) rest.push(index)
  }

  const rand = random(seedFrom(`${spin.id}:ports`))
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const swap = Math.floor(rand() * (i + 1))
    ;[rest[i], rest[swap]] = [rest[swap], rest[i]]
  }

  let next = 0
  for (let mote = 0; mote < count; mote += 1) {
    if (mote !== capturedMote) petitionOf[mote] = rest[next++]
  }
  return petitionOf
}

/**
 * The baked descent for a command, memoised.
 *
 * A sim is a few milliseconds, which is nothing once and ruinous sixty times a
 * second, so the last plan is held. One entry rather than a map: only one
 * descent is ever on screen, and a map would keep every spin of the session
 * alive for a mechanism nobody is watching any more.
 */
let cached: { key: string; plan: DescentPlan } | null = null

export function descentPlan(spin: SpinCommand, count: number): DescentPlan {
  const key = `${spin.id}:${count}`
  if (cached?.key === key) return cached.plan

  const baked = simulate(spin, Math.max(count, 1))
  const petitionOf = assign(spin, Math.max(count, 1), baked.capturedMote)
  const moteOf = new Array<number>(petitionOf.length)
  petitionOf.forEach((petition, mote) => {
    moteOf[petition] = mote
  })

  const plan: DescentPlan = { ...baked, petitionOf, moteOf }
  cached = { key, plan }
  return plan
}

// ------------------------------------------------------------------ playback

export interface DescentFrame {
  /** Baked frame to draw, fractional so the renderer can interpolate. */
  frame: number
  /** Fraction of the whole spin elapsed. */
  progress: number
  /** True once Nayara has closed on the mote it took. */
  taken: boolean
  /** How far through the absorption, 0..1, for the reveal. */
  absorbed: number
}

/**
 * Where the descent is at `now`.
 *
 * The bake is resampled onto the command's own duration rather than played at
 * the rate it was simulated. The operator sets that duration anywhere from
 * three seconds to twenty, and no single gravity constant looks right across
 * that range — so the descent is timed to land exactly as the spin ends, and a
 * long spin simply reads as a slower fall. The settle is the absorption.
 */
export function descentFrameAt(plan: DescentPlan, spin: SpinCommand, now: number): DescentFrame {
  const elapsed = now - spin.startedAt
  const total = spin.durationMs + spin.settleMs

  if (elapsed <= 0) return { frame: 0, progress: 0, taken: false, absorbed: 0 }

  if (elapsed < spin.durationMs) {
    return {
      frame: (elapsed / spin.durationMs) * plan.capturedFrame,
      progress: elapsed / total,
      taken: false,
      absorbed: 0
    }
  }

  return {
    frame: plan.capturedFrame,
    progress: Math.min(elapsed / total, 1),
    taken: true,
    absorbed: Math.min((elapsed - spin.durationMs) / Math.max(spin.settleMs, 1), 1)
  }
}

/** Reads one mote's baked position, interpolated between frames. */
export function motePosition(
  plan: DescentPlan,
  mote: number,
  frame: number
): { x: number; y: number; z: number } {
  const last = plan.frames - 1
  const clamped = frame < 0 ? 0 : frame > last ? last : frame
  const lower = Math.floor(clamped)
  const upper = Math.min(lower + 1, last)
  const blend = clamped - lower
  const stride = plan.motes * 3
  const a = lower * stride + mote * 3
  const b = upper * stride + mote * 3
  const path = plan.path

  return {
    x: path[a] + (path[b] - path[a]) * blend,
    y: path[a + 1] + (path[b + 1] - path[a + 1]) * blend,
    z: path[a + 2] + (path[b + 2] - path[a + 2]) * blend
  }
}
