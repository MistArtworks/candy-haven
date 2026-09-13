import { useEffect, useRef, type ReactNode } from 'react'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import { LOGOMARK_PATH, LOGOMARK_VIEWBOX } from '@renderer/components/sigil/logomark.path'
import type { SceneProps } from './scenes'
import {
  TAU,
  aimCamera,
  createCamera,
  createPlexus,
  createStarShell,
  drawPlexus,
  drawStars,
  mountScene,
  project,
  softSprite,
  stamp,
  tint,
  type Camera,
  type PlexusNode,
  type Projected,
  type Star
} from './scene-kit'

/**
 * THE GATE — a threshold held open, and the procession still arriving.
 *
 * A causeway runs across a dark plain to a colossal ribbed portal. A shaft of
 * crimson light stands in its aperture and strikes the dais at its foot. Robed
 * figures are walking the causeway toward it, strung out at every distance,
 * none of them larger than a thumbnail. Behind it a row of lesser monoliths
 * recedes into haze, and a dim crescent world sits on the horizon.
 *
 * ## The story
 *
 * The brief's central instruction is not about architecture, it is about
 * *proportion*: **"human figures are always small against the architecture —
 * this is deliberate: awe and hierarchy over individuality"**. So the subject is
 * not the gate. It is the walk toward it.
 *
 * Everything is arranged to say that. The causeway converges so the eye is
 * dragged up it. The figures stand at every depth, so the same object appears at
 * a dozen sizes and the distance becomes readable. The skyline behind is
 * *shorter* than the gate, so the gate is not merely large, it is the largest
 * thing here. The one saturated colour in the palette is spent on the aperture
 * and nowhere else, because that is what they are all walking toward.
 *
 * ## The camera stands in front of it
 *
 * Level, square on, at the height of somebody on the causeway. Two earlier
 * passes got this wrong in both directions and it is worth saying why.
 *
 * From *below* you see two verticals and a lot of sky: the deck collapses to a
 * line and the procession — the actual subject — is edge-on and unreadable.
 * From *above* the deck opens out but the gate flattens toward a plan, and a
 * monument photographed from above stops being monumental, because looking down
 * on a thing is the one angle that cannot make it tall.
 *
 * Level is the angle that holds both. The gate keeps its full height against
 * the frame, and the small tilt — about seven degrees, no more than the ground
 * falling away — is just enough to separate the figures along the deck instead
 * of stacking them on one line.
 *
 * ## What moves
 *
 * Very little. The structure is fixed in world space and the *camera* leans with
 * the cursor. Only three things have a clock: the procession's walk, the motes
 * in the shaft, and the beam's breath. At `reduced` motion the walk stops and
 * the picture holds.
 */

// --------------------------------------------------------------- the geometry
//
// Sized against the projection rather than by eye, because "colossal" is a
// framing problem and not a number. At the camera below, the 1,120 units from
// the plain to the top of the lintel land at a little under half a 900px
// viewport, leaving the causeway room to run out beneath it and clear of the
// type block the landing sets over this.

/** Half the gap between the pylons' inner faces. */
const APERTURE = 200
const PYLON_WIDTH = 360
const PYLON_DEPTH = 300
const PYLON_HEIGHT = 760
/** The lintel's underside, and its thickness above that. */
const LINTEL_Y = -PYLON_HEIGHT
const LINTEL_HEIGHT = 140
/**
 * The plain everything stands on. `y` runs *down*, so this is below the lens.
 *
 * Forty units — about knee height on one of the walkers. The camera is not
 * watching the causeway, it is **down on it**, and that number is doing most of
 * the work in the shot: from here the deck compresses to a band, the pylons run
 * out of the top of the frame, and the figures nearest the lens stand taller
 * than the gate behind them.
 *
 * The pitch stays *positive* regardless, and that is geometry rather than
 * taste. The floor is below the eye, so it has to recede upward to a horizon;
 * tilting the lens below level puts the vanishing point beneath the near ground
 * and the road appears to fall away from the viewer. The look of gazing upward
 * comes from being low and framing high, not from aiming the camera up.
 */
const GROUND_Y = 40
/**
 * The dais: three courses of steps climbing to the threshold.
 *
 * Rebuilt, because none of it was visible and all three reasons were geometry.
 *
 * It stood at *positive* z — behind the gate. Every riser faced away from the
 * lens and the pylons covered what was left, so the flight the shaft lands on
 * was on the far side of the wall from the camera. It runs toward the viewer
 * now, which is the side a person approaches a gate from.
 *
 * And it was seventy-eight units tall against a walker of about sixty-eight:
 * a flight of stairs taller than the people on it, with risers better than a
 * third of a person high. The eye sits forty units above the plain, so the top
 * tread was *above the camera* — the scene was looking up at a floor. Thirty
 * units over three courses puts the whole thing below the eyeline, which is
 * what it takes to see a step as a step.
 */
const DAIS_STEPS = 3
const DAIS_RISE = 10
const DAIS_RUN = 160
/**
 * The top of the dais — the surface the shaft actually strikes.
 *
 * The beam ran to `GROUND_Y`, the plain, which is three risers *below* this. So
 * its lowest stretch was inside the steps and the visible column stopped a
 * little above the stone, floating. A shaft of light ends where it hits
 * something, and this is what it hits.
 */
const DAIS_TOP = GROUND_Y - DAIS_STEPS * DAIS_RISE
/**
 * Where the bottom step meets the plain.
 *
 * The flight climbs from here to the pylons' front face, so the top tread ends
 * exactly where the gate begins and the threshold is a real edge rather than a
 * coincidence of two numbers.
 */
const DAIS_FOOT = -PYLON_DEPTH / 2 - DAIS_STEPS * DAIS_RUN
/**
 * How far the causeway runs toward the viewer.
 *
 * Bounded rather than endless. Past a certain length the near end of the deck
 * crosses behind the lens, the projection drops it, and the courses nearest the
 * camera simply stop being drawn. This is the length that still reaches the
 * bottom of the frame at this pitch.
 */
const CAUSEWAY_FAR = 200
const CAUSEWAY_NEAR = -2100
const CAUSEWAY_HALF = 430
/**
 * How close the procession is allowed to come.
 *
 * The deck runs nearer than this — it has to, or it stops before the bottom of
 * the frame — but a figure standing at its near end projects taller than the
 * gate and lands across the title block. Holding the walkers back keeps the
 * nearest of them at roughly a head's height on screen, which is the size that
 * reads as *a person over there* rather than as a shape in the way.
 */
const PROCESSION_NEAR = -1500
/**
 * The colonnade flanking the deck.
 *
 * Added because at eye height the frame is mostly sky and plain — the gate holds
 * the middle and the sides are empty. A run of pillars fills them, and it earns
 * its place rather than merely occupying it: each pair is a known width at a
 * known spacing, so the run is a ruler laid down the causeway. The eye reads the
 * distance off the pillars before it reads it off anything else.
 */
const COLONNADE_X = 610
const COLONNADE_WIDTH = 96
const COLONNADE_DEPTH = 96
const COLONNADE_HEIGHT = 430
const COLONNADE_STEP = 300

interface Course {
  y: number
  t: number
}

/**
 * Something lying on the causeway: standing water, a fallen block, a stone.
 *
 * The deck was a clean ruled surface running up to a gate whose walls are
 * falling apart, which is a contradiction the eye picks up before it can say
 * why. Whatever came off the pylons landed somewhere, and the road has not been
 * swept in a long time.
 */
interface Debris {
  x: number
  z: number
  /** 0 standing water, 1 a fallen block, 2 a stone. */
  kind: 0 | 1 | 2
  size: number
  /** Its own number, for the deterministic jitter that gives it a shape. */
  seed: number
}

/**
 * Anything standing on the deck, for the one depth-sorted pass that draws it.
 *
 * The walkers and the debris share a surface, so they have to share an
 * ordering. Drawn as two passes, a figure fifteen hundred units up the road
 * paints over a rock in the foreground — which is the same painter's-algorithm
 * mistake that made the procession overlap wrongly before it was sorted.
 */
interface Standing {
  z: number
  walker: Pilgrim | null
  piece: Debris | null
}

interface Pilgrim {
  x: number
  z: number
  pace: number
  height: number
  phase: number
  /**
   * How broad and how hooded this one is, 0..1.
   *
   * Height alone was not enough variation: a crowd of one silhouette at a dozen
   * scales reads as the same person stamped repeatedly, which is the specific
   * thing that made these look like traffic cones. Shoulder width and hood size
   * move with this, so no two are quite the same shape.
   */
  build: number
  /** Where in its stride it is. Bobs and leans off this. */
  stride: number
}

/**
 * The sigil turning in the aperture.
 *
 * Sited a little above the middle of the opening and sized to clear the pylons:
 * it rotates, so its widest moment has to fit, and the aperture is only four
 * hundred units across.
 */
const SIGIL_Y = -420
const SIGIL_WIDTH = 250
/** Radians a second. A full turn in about twenty seconds. */
const SIGIL_SPIN = 0.3
const SIGIL_SAMPLES = 190
/** Links are made between samples closer than this, in the mark's own units. */
const SIGIL_REACH = 34
/**
 * How far a node wanders from where the path put it.
 *
 * Small on purpose — about one part in sixty of the mark's width. Enough that
 * the wire is never quite still and reads as something held together by a
 * field rather than drawn, and not enough to stop it being the logo.
 */
const SIGIL_WANDER = 4.2
/** How far the whole mark rises and falls, and how slowly. */
const SIGIL_BOB = 16
const SIGIL_BOB_RATE = 0.42

/** One node of the sigil, in the mark's own plane. */
interface SigilNode {
  /** Across the mark. Becomes x and z as it turns. */
  lx: number
  /** Down the mark. This is world `y`, and never rotates. */
  ly: number
  /**
   * A hair of thickness.
   *
   * Without it the mark is perfectly flat and collapses to a zero-width line
   * twice a turn, which reads as a glitch rather than as an edge-on plane.
   */
  lz: number
  /** Its own offset in the wander, so the wire does not pulse as one piece. */
  phase: number
  /** Filled each frame. */
  sx: number
  sy: number
  scale: number
}

interface Distant {
  x: number
  z: number
  width: number
  height: number
  shade: number
}

interface Mote {
  x: number
  y: number
  z: number
  rise: number
  glow: number
  phase: number
}

/** A tower on the far skyline, with lit courses up it. */
interface Tower {
  x: number
  z: number
  width: number
  height: number
  /** Lit bands up the face. Precomputed so they do not crawl. */
  courses: number[]
  shade: number
}

/**
 * One craft in a traffic lane.
 *
 * They travel a lane rather than wandering: this civilisation's whole
 * proposition is that order is devotional, and a sky full of things taking
 * their own paths would say the opposite of everything the architecture does.
 */
interface Craft {
  x: number
  y: number
  z: number
  /** World units per second. Sign is the lane's direction. */
  speed: number
  length: number
}

export function GateScene({ tone, leanRef, className }: SceneProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationsEnabled = useAnimationsEnabled()

  const toneRef = useRef(tone)
  useEffect(() => {
    toneRef.current = tone
  }, [tone])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const camera = createCamera()
    const a: Projected = { x: 0, y: 0, scale: 0, depth: 0 }
    const b: Projected = { x: 0, y: 0, scale: 0, depth: 0 }
    const c: Projected = { x: 0, y: 0, scale: 0, depth: 0 }
    const d: Projected = { x: 0, y: 0, scale: 0, depth: 0 }

    const spark = softSprite(32, 'goldHot', [
      [0, 1],
      [0.3, 0.42],
      [1, 0]
    ])
    const mote = softSprite(48, 'crimsonHot', [
      [0, 0.9],
      [0.35, 0.3],
      [1, 0]
    ])
    const halo = softSprite(512, 'crimson', [
      [0, 0.3],
      [0.24, 0.11],
      [1, 0]
    ])
    const pool = softSprite(512, 'crimsonHot', [
      [0, 0.55],
      [0.16, 0.18],
      [1, 0]
    ])
    const worldGlow = softSprite(512, 'brass', [
      [0, 0.28],
      [0.4, 0.08],
      [1, 0]
    ])

    let stars: Star[] = []
    let courses: Course[] = []
    let pilgrims: Pilgrim[] = []
    let distants: Distant[] = []
    let motes: Mote[] = []
    let towers: Tower[] = []
    let craft: Craft[] = []
    let debris: Debris[] = []
    const sigil = sampleSigil()
    let plexus: PlexusNode[] = []

    const makePilgrim = (z?: number): Pilgrim => ({
      // Clustered toward the middle of the deck: a crowd walking somewhere
      // funnels, it does not spread evenly across the full width.
      x: (Math.random() + Math.random() - 1) * CAUSEWAY_HALF * 0.82,
      z: z ?? PROCESSION_NEAR + Math.random() * (CAUSEWAY_FAR - PROCESSION_NEAR),
      pace: 22 + Math.random() * 18,
      height: 62 + Math.random() * 12,
      phase: Math.random() * TAU,
      build: Math.random(),
      stride: Math.random() * TAU
    })

    const makeMote = (seeded: boolean): Mote => {
      const angle = Math.random() * TAU
      const radius = Math.random() * APERTURE * 0.7
      return {
        x: Math.cos(angle) * radius,
        y: seeded ? DAIS_TOP - Math.random() * (PYLON_HEIGHT + DAIS_TOP) : DAIS_TOP,
        z: Math.sin(angle) * radius * 0.5,
        rise: 70 + Math.random() * 190,
        glow: 0.25 + Math.random() * 0.75,
        phase: Math.random() * TAU
      }
    }

    const teardown = mountScene(canvas, {
      animated: animationsEnabled,
      leanRef,
      toneRef,

      onResize: () => {
        stars = createStarShell(520, 6000, 13000)

        /*
         * Ribbing spaced evenly in *world* units, not on screen.
         *
         * Even screen spacing is the tell that a flat shape is faking depth — it
         * holds a constant gap as the pylon recedes, which a real perspective
         * never does. World spacing plus the projection gives the crowding
         * toward the lintel for free.
         */
        const count = 22
        courses = Array.from({ length: count }, (_, index) => {
          const t = index / (count - 1)
          return { y: DAIS_TOP - t * (PYLON_HEIGHT + DAIS_TOP), t }
        })

        pilgrims = Array.from({ length: 26 }, () => makePilgrim())
        motes = Array.from({ length: 80 }, () => makeMote(true))

        /*
         * What the road has collected.
         *
         * Biased toward the edges — raised to a power under one, which pushes
         * the distribution outward — because the middle of the deck is where
         * the procession walks and a crowd wears a path. There is still plenty
         * on it; there is simply more at the sides, which is what a road that
         * is still used but no longer maintained looks like.
         *
         * A third of it is standing water. That is the piece worth having: the
         * deck is a flat dark surface and nothing on it reflects, so the one
         * light in the scene falls on the road and dies there. A puddle gives
         * it back.
         */
        debris = Array.from({ length: 58 }, () => {
          const out = Math.random() ** 0.62
          const kind = (Math.random() < 0.34 ? 0 : Math.random() < 0.55 ? 1 : 2) as 0 | 1 | 2
          return {
            x: (Math.random() < 0.5 ? -1 : 1) * CAUSEWAY_HALF * (0.14 + out * 0.84),
            z: CAUSEWAY_NEAR + 140 + Math.random() * (DAIS_FOOT - CAUSEWAY_NEAR - 140),
            kind,
            size:
              kind === 0
                ? 26 + Math.random() * 54
                : kind === 1
                  ? 9 + Math.random() * 15
                  : 5 + Math.random() * 9,
            seed: Math.random() * 500
          }
        })

        /*
         * The resonance plexus, in the air over the plain.
         *
         * Every scene in this set carries one — it is the lore's single visual
         * claim, that everything here shares an underlying frequency — and the
         * gate was the only field without it, which quietly put it outside the
         * set.
         *
         * Sited *above* the ground and biased toward the aperture, so it reads
         * as what the threshold opens onto rather than as weather. Placed in a
         * slab rather than a sphere: a sphere would put as much of it behind
         * the camera as in front, and half the nodes would be paying for a
         * projection that discards them.
         */
        /*
         * Towers, further out than the slabs and taller.
         *
         * A second rank behind the skyline, with lit courses up them, so the
         * horizon has a city on it rather than a row of blocks. Held outside a
         * wide corridor either side of the axis — the aperture is the subject
         * and nothing is allowed to stack up behind it.
         */
        towers = Array.from({ length: 22 }, (_, index) => {
          const side = index % 2 === 0 ? -1 : 1
          const rank = Math.floor(index / 2)
          const height = 900 + Math.random() * 1500
          return {
            x: side * (1700 + rank * 700 + Math.random() * 500),
            z: 3200 + rank * 900 + Math.random() * 1200,
            width: 110 + Math.random() * 170,
            height,
            // Bands, not windows. At this distance a window is a subpixel and a
            // course is a mark you can actually see.
            courses: Array.from({ length: Math.floor(height / 160) }, (_, band) => band),
            shade: 0.3 - rank * 0.02
          }
        })

        /*
         * Four lanes of traffic, alternating direction.
         *
         * High and far, because the moment a craft is large enough to have a
         * shape it becomes a second thing to look at. Up there they read as
         * movement on the skyline — the city going about its business past a
         * rite it has stopped attending.
         */
        craft = Array.from({ length: 26 }, (_, index) => {
          const lane = index % 4
          const direction = lane % 2 === 0 ? 1 : -1
          return {
            x: -7000 + Math.random() * 14000,
            y: -1500 - lane * 420 - Math.random() * 160,
            z: 2600 + lane * 1100 + Math.random() * 900,
            speed: direction * (260 + Math.random() * 170),
            length: 90 + Math.random() * 70
          }
        })

        plexus = createPlexus(120, () => {
          /*
           * Held out of the middle, with a clear corridor over the aperture.
           *
           * A first pass biased the density *toward* the axis, which put the
           * brightest knot of the web directly above the shaft — the one place
           * in the composition that is supposed to have a single object in it.
           * It read as a burst of light in the gateway and beat the beam it was
           * meant to be background for.
           *
           * Now it opens outward instead: nothing inside a corridor either side
           * of centre, and it climbs as it spreads, so the sky over the gate
           * stays empty and the corners fill.
           */
          const side = Math.random() < 0.5 ? -1 : 1
          const out = Math.random()
          return {
            x: side * (1400 + out * 3400),
            y: -650 - Math.random() * 1700,
            z: -900 + Math.random() * 5400
          }
        })

        /*
         * The skyline: lesser gates, further out and to the sides.
         *
         * Kept clear of the centre so nothing competes with the aperture, and
         * every one shorter than the gate. The composition's claim is that this
         * structure is the largest thing on the plain; a silhouette behind it
         * reading as taller would undo that in one glance.
         */
        distants = Array.from({ length: 30 }, (_, index) => {
          const side = index % 2 === 0 ? -1 : 1
          const rank = Math.floor(index / 2)
          return {
            // Pulled in closer than they were, and more of them. At eye height
            // the horizon is a thin band; a sparse skyline out at the limit of
            // the haze simply is not there, and the sides of the frame stay
            // empty however tall the gate is.
            x: side * (900 + rank * 520 + Math.random() * 380),
            z: 1300 + rank * 620 + Math.random() * 600,
            width: 200 + Math.random() * 360,
            height: 240 + Math.random() * 520,
            shade: 0.6 - rank * 0.035
          }
        })
      },

      onFrame: ({ context, width, height, elapsed, delta, leanX, leanY, intensity }) => {
        context.clearRect(0, 0, width, height)

        /*
         * Standing in front of it, level.
         *
         * Positive pitch tilts *down*; this is barely any — the horizon sits a
         * little above the gate's footing and the deck reads as ground rather
         * than as a wall. Enough to string the procession out along it, not
         * enough to look down on the structure.
         *
         * The lean is small in both axes. This composition is symmetrical and
         * the symmetry is the picture; the swing exists to open one pylon's
         * inner face and close the other's, not to break the frame.
         */
        /*
         * A slow float, not a shake.
         *
         * A first pass layered a fast tremor on top of this — a couple of hertz,
         * meant to read as the ground carrying the shaft's energy. It read as
         * buzz. At this scale the picture is monumental and almost still, and
         * anything vibrating in it fights the one quality holding it together.
         *
         * So it is all slow: four sines between roughly a nine- and a
         * twenty-second period, and nothing faster. Every rate is prime against
         * the others, so the pair of them trace a path that never closes and the
         * drift never settles into a rhythm you could count.
         *
         * That last property is what lets the amplitude be this large. A
         * repeating wobble at ten pixels would be obvious and cheap; a wander
         * that never comes back to the same place just reads as a camera being
         * held.
         *
         * Scaled against the viewport so it is the same *apparent* drift on a
         * laptop and a large panel, and applied to the view origin rather than
         * to the world — moving the camera takes the horizon with everything
         * else, which is what reads as the lens rather than as the architecture
         * coming loose.
         */
        const jolt = Math.max(width, height) / 900
        const shakeX = (Math.sin(elapsed * 0.41) * 6.4 + Math.sin(elapsed * 0.67) * 3.4) * jolt
        const shakeY = (Math.cos(elapsed * 0.31) * 5.2 + Math.cos(elapsed * 0.53) * 2.6) * jolt

        aimCamera(camera, {
          /*
           * Damped, both axes.
           *
           * The swing was wide enough that the composition at one end of a
           * cursor sweep was a different shot from the other — which is a nice
           * demonstration and a bad landing, because the framing you get is
           * then whatever the pointer happened to be doing. Halved: enough that
           * the structure has parallax and is plainly three-dimensional, not
           * enough to recompose the picture.
           */
          yaw: leanX * 0.05,
          /*
           * Barely off level, and it cannot go below it.
           *
           * Two degrees is enough to lay the road into frame and string the
           * procession along it rather than stacking them on one line. Any more
           * and the eye starts looking *down* on a gate it is standing at the
           * foot of; any less — and certainly anything negative — and the floor
           * inverts. See `GROUND_Y` for why the sign is fixed.
           */
          pitch: 0.035 + leanY * 0.015,
          focal: Math.max(width, height) * 0.8,
          originX: width * 0.5 + shakeX,
          // Pushed down the frame, so the horizon sits low and the structure has
          // the height above it. This is the half of "looking up" that the
          // pitch is not allowed to do.
          originY: height * 0.62 + shakeY,
          // Close enough that the gate has to be looked up at, far enough that
          // the lintel stays inside the top of the frame.
          // Closer than before: from down here the gate should fill the frame
          // rather than sit in it.
          distance: 2500
        })

        // ------------------------------------------------------------ the sky
        context.globalCompositeOperation = 'lighter'
        drawStars(context, camera, stars, spark, elapsed, intensity * 0.75, a)
        drawCrescent(context, camera, width, height, intensity, worldGlow, a)
        drawHaze(context, camera, width, height, intensity, a)

        // The plexus sits behind everything solid: the gate and the skyline cut
        // it, which is what puts it in the sky rather than over the lens.
        drawPlexus(context, camera, plexus, spark, {
          reach: 1000,
          elapsed,
          intensity,
          line: 'brass',
          node: 'gold',
          // Background, and priced like it. At anything above a fifth it stops
          // being the field behind the picture and becomes a subject.
          strength: 0.16,
          scratch: a
        })

        // ------------------------------------------------- what is behind it
        context.globalCompositeOperation = 'source-over'
        drawPlain(context, camera, width, height, intensity, a)
        drawTowers(context, camera, towers, intensity, a, b, c, d)
        drawSkyline(context, camera, distants, intensity, a, b, c, d)

        // Traffic sits behind the gate and in front of the towers, which is
        // where the lanes actually are.
        drawTraffic(context, camera, craft, delta, animationsEnabled, intensity, a, b)

        // --------------------------------------------------- the ground plane
        drawCauseway(context, camera, intensity, a, b)
        drawColonnade(context, camera, intensity, a, b, c, d)
        drawRings(context, camera, elapsed, intensity, a)

        /*
         * The threshold floor, and only the floor.
         *
         * It lies *behind* the beam — it runs back through the aperture — so it
         * has to go down before it. With no depth buffer the later fill simply
         * covers the earlier one, and painting this afterwards erased the foot
         * of the shaft with the stone the shaft is supposed to be striking. The
         * flight of steps in front of the gate is the opposite case and is laid
         * down further on, after the pylons.
         */
        drawPlinth(context, camera, intensity, a, b, c, d)

        // -------------------------------------------------------- the shaft
        //
        // Before the structure, so the pylons cut its edges — which is what
        // seats it *in* the aperture instead of over the whole picture. In
        // `lighter`, so it adds over the steps rather than replacing them.
        context.globalCompositeOperation = 'lighter'
        drawBeam(context, camera, elapsed, intensity, halo, a, b)

        // The mark, hanging in the opening with the shaft behind it. Still in
        // `lighter`: it is light, not an object occluding the beam.
        drawSigil(context, camera, sigil, spark, elapsed, intensity, a)

        // ----------------------------------------------------------- the gate
        context.globalCompositeOperation = 'source-over'
        drawPylon(context, camera, -1, courses, leanX, intensity, a, b, c, d)
        drawPylon(context, camera, 1, courses, leanX, intensity, a, b, c, d)
        drawLintel(context, camera, intensity, a, b, c, d)
        drawBanners(context, camera, elapsed, intensity, a, b, c, d)

        /*
         * And the steps, which are nearer than any of it.
         *
         * The flight runs from the pylons' front face toward the viewer, so
         * every course of it is in front of the gate and goes down after it.
         * Drawing it with the floor — as one `drawDais` did — meant one end or
         * the other was always in the wrong order.
         */
        drawSteps(context, camera, intensity, a, b, c, d)

        // ------------------------------------------------------ the procession
        if (animationsEnabled) {
          for (const walker of pilgrims) {
            walker.z += walker.pace * delta
            if (walker.z > CAUSEWAY_FAR) Object.assign(walker, makePilgrim(PROCESSION_NEAR))
          }
        }

        /*
         * Everything standing on the deck, far to near, in one pass.
         *
         * The walkers were drawn in array order, so whichever happened to be
         * later in the list painted over whichever was earlier regardless of
         * where the two were standing — a figure by the gate could cover one in
         * the foreground. Sorting by depth is what lets them overlap correctly,
         * and overlapping correctly is most of what makes a crowd read as a
         * crowd rather than as a scatter.
         *
         * The debris joins the same list rather than getting a pass of its own,
         * for exactly that reason: two sorted passes are still wrong across
         * each other, and a walker up the road would paint over a rock at the
         * viewer's feet.
         */
        const standing: Standing[] = []
        for (const walker of pilgrims) standing.push({ z: walker.z, walker, piece: null })
        for (const piece of debris) standing.push({ z: piece.z, walker: null, piece })
        standing.sort((left, right) => right.z - left.z)

        for (const entry of standing) {
          if (entry.walker) drawPilgrim(context, camera, entry.walker, elapsed, intensity, a)
          else if (entry.piece) drawDebris(context, camera, entry.piece, intensity, a, b, c, d)
        }

        // ------------------------------------------------------------- bloom
        context.globalCompositeOperation = 'lighter'

        const breath = 0.84 + Math.sin(elapsed * 0.5) * 0.16
        const foot = project(camera, 0, DAIS_TOP, 0, a)
        if (foot) {
          stamp(
            context,
            pool,
            foot.x,
            foot.y,
            pool.width * foot.scale * 2.3,
            0.72 * intensity * breath
          )
          stamp(
            context,
            halo,
            foot.x,
            foot.y,
            halo.width * foot.scale * 4.1,
            0.44 * intensity * breath
          )
        }

        /*
         * The flare at the strike point.
         *
         * A horizontal streak through the base and a shorter vertical one — the
         * cross a very bright source makes through a lens. It is the single
         * cheapest way to say "this is the brightest thing in the picture", and
         * it is sited on the one object that is supposed to be.
         */
        if (foot) {
          const reach = Math.max(width, height) * 0.34 * breath
          const streak = context.createLinearGradient(
            foot.x - reach,
            foot.y,
            foot.x + reach,
            foot.y
          )
          streak.addColorStop(0, tint('crimson', 0))
          streak.addColorStop(0.4, tint('crimson', 0.22 * intensity))
          streak.addColorStop(0.5, tint('goldHot', 0.55 * intensity))
          streak.addColorStop(0.6, tint('crimson', 0.22 * intensity))
          streak.addColorStop(1, tint('crimson', 0))

          context.globalAlpha = 1
          context.fillStyle = streak
          context.fillRect(foot.x - reach, foot.y - 1.6, reach * 2, 3.2)

          const rise = reach * 0.42
          const upright = context.createLinearGradient(foot.x, foot.y - rise, foot.x, foot.y + rise)
          upright.addColorStop(0, tint('crimson', 0))
          upright.addColorStop(0.5, tint('crimsonHot', 0.42 * intensity))
          upright.addColorStop(1, tint('crimson', 0))

          context.fillStyle = upright
          context.fillRect(foot.x - 1.4, foot.y - rise, 2.8, rise * 2)
        }

        for (const speck of motes) {
          if (animationsEnabled) {
            speck.y -= speck.rise * delta
            if (speck.y < LINTEL_Y) Object.assign(speck, makeMote(false))
          }

          const p = project(camera, speck.x, speck.y, speck.z, a)
          if (!p) continue

          const climbed = (DAIS_TOP - speck.y) / (PYLON_HEIGHT + DAIS_TOP)
          const flicker = 0.6 + Math.sin(elapsed * 1.9 + speck.phase) * 0.4
          stamp(
            context,
            mote,
            p.x,
            p.y,
            Math.max(mote.width * p.scale * 0.45, 1),
            speck.glow * flicker * (1 - climbed) * 0.62 * intensity
          )
        }

        context.globalAlpha = 1
        context.globalCompositeOperation = 'source-over'
      }
    })

    return teardown
  }, [animationsEnabled, leanRef])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}

// ---------------------------------------------------------------------- parts

/**
 * Deterministic noise from an integer, 0..1.
 *
 * The damage on this architecture has to be *the same damage* every frame. A
 * `Math.random()` in a draw call would re-break every wall sixty times a second
 * and the ruins would boil. Storing a profile per structure would work too, but
 * this is the same answer for free: the same index always yields the same
 * number, so a crack is a property of the wall rather than of the frame.
 */
function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/**
 * The height of whatever you are standing on at `z`.
 *
 * The plain out on the causeway, and one riser higher for every course of the
 * dais you have climbed. Anything that stands on the ground asks this rather
 * than assuming `GROUND_Y`, which is what lets the procession walk *up* the
 * steps instead of wading through them.
 */
function groundAt(z: number): number {
  if (z <= DAIS_FOOT) return GROUND_Y
  const climbed = Math.min(DAIS_STEPS, Math.floor((z - DAIS_FOOT) / DAIS_RUN) + 1)
  return GROUND_Y - climbed * DAIS_RISE
}

/** Fills a world-space polygon. Every solid in the scene goes through this. */
function face(
  context: CanvasRenderingContext2D,
  camera: Camera,
  points: readonly [number, number, number][],
  fill: string | CanvasGradient,
  alpha: number,
  a: Projected,
  b: Projected,
  c: Projected,
  d: Projected
): void {
  const slots = [a, b, c, d]
  const screen: { x: number; y: number }[] = []

  for (let index = 0; index < points.length; index += 1) {
    const [x, y, z] = points[index]
    const p = project(camera, x, y, z, slots[index % slots.length])
    if (!p) return
    // Copied out: the scratch objects are reused on the next call, so holding
    // the reference would give every corner the last point's coordinates.
    screen.push({ x: p.x, y: p.y })
  }

  context.globalAlpha = alpha
  context.fillStyle = fill
  context.beginPath()
  context.moveTo(screen[0].x, screen[0].y)
  for (let index = 1; index < screen.length; index += 1) {
    context.lineTo(screen[index].x, screen[index].y)
  }
  context.closePath()
  context.fill()
  context.globalAlpha = 1
}

/** The dim world on the horizon. */
function drawCrescent(
  context: CanvasRenderingContext2D,
  camera: Camera,
  width: number,
  height: number,
  intensity: number,
  glow: HTMLCanvasElement,
  a: Projected
): void {
  // Sited near the horizon rather than high in the sky. At this angle the sky
  // is the upper half of the frame, and a world hanging in the middle of it
  // would compete with the aperture for the eye.
  const anchor = project(camera, -5200, -300, 9000, a)
  if (!anchor) return

  const radius = Math.min(width, height) * 0.13

  stamp(context, glow, anchor.x, anchor.y, radius * 6, 0.4 * intensity)

  // The lit limb only. A full disc reads as a second sun and pulls the eye off
  // the aperture; a crescent reads as a world with a star behind it.
  context.save()
  context.globalAlpha = 0.5 * intensity
  context.beginPath()
  context.arc(anchor.x, anchor.y, radius, 0, TAU)
  context.clip()

  const gradient = context.createLinearGradient(
    anchor.x - radius,
    anchor.y - radius,
    anchor.x + radius,
    anchor.y + radius
  )
  gradient.addColorStop(0, tint('brass', 0.5))
  gradient.addColorStop(0.55, tint('obsidian', 0.9))
  gradient.addColorStop(1, tint('obsidian', 1))
  context.fillStyle = gradient
  context.fillRect(anchor.x - radius, anchor.y - radius, radius * 2, radius * 2)

  context.restore()
  context.globalAlpha = 1
}

/** A band of atmosphere sitting on the horizon, behind everything solid. */
function drawHaze(
  context: CanvasRenderingContext2D,
  camera: Camera,
  width: number,
  height: number,
  intensity: number,
  a: Projected
): void {
  const horizon = project(camera, 0, GROUND_Y, 12000, a)
  if (!horizon) return

  const band = height * 0.2
  const gradient = context.createLinearGradient(0, horizon.y - band, 0, horizon.y + band * 0.4)
  gradient.addColorStop(0, tint('brass', 0))
  gradient.addColorStop(0.55, tint('brass', 0.11 * intensity))
  gradient.addColorStop(1, tint('crimsonGlass', 0.07 * intensity))

  context.globalAlpha = 1
  context.fillStyle = gradient
  context.fillRect(0, horizon.y - band, width, band * 1.4)
}

/**
 * The far towers, with lit courses up them.
 *
 * Drawn before the nearer slabs so those overlap these, which is the only thing
 * that makes the horizon feel layered rather than painted.
 *
 * The courses are the whole point of them. A silhouette at this distance is a
 * dark rectangle and could be anything; a dark rectangle with a regular ladder
 * of lit bands is a building with floors in it, and the eye takes about no time
 * at all to decide which it is looking at.
 */
function drawTowers(
  context: CanvasRenderingContext2D,
  camera: Camera,
  towers: readonly Tower[],
  intensity: number,
  a: Projected,
  b: Projected,
  c: Projected,
  d: Projected
): void {
  const ordered = [...towers].sort((left, right) => right.z - left.z)

  for (const tower of ordered) {
    const half = tower.width / 2
    const fade = Math.max(0.08, tower.shade) * intensity

    face(
      context,
      camera,
      [
        [tower.x - half, GROUND_Y, tower.z],
        [tower.x + half, GROUND_Y, tower.z],
        [tower.x + half, GROUND_Y - tower.height, tower.z],
        [tower.x - half, GROUND_Y - tower.height, tower.z]
      ],
      tint('obsidian', 1),
      fade + 0.35,
      a,
      b,
      c,
      d
    )

    for (const band of tower.courses) {
      const y = GROUND_Y - 140 - band * 160
      const left = project(camera, tower.x - half * 0.72, y, tower.z, a)
      const right = project(camera, tower.x + half * 0.72, y, tower.z, b)
      if (!left || !right) continue
      // Sub-pixel courses stack into a solid block and the tower turns into a
      // lit slab, so anything too fine to resolve is simply not drawn.
      if (Math.abs(right.x - left.x) < 1.2) continue

      context.globalAlpha = fade * 0.75
      context.strokeStyle = tint('gold', 1)
      context.lineWidth = Math.max(0.5, 1.2 * left.scale)
      context.beginPath()
      context.moveTo(left.x, left.y)
      context.lineTo(right.x, right.y)
      context.stroke()
    }
  }

  context.globalAlpha = 1
}

/**
 * Traffic in the lanes over the city.
 *
 * Each craft is a slab with one lamp on it and a short trail behind — at this
 * distance that is the entire vocabulary available, and it is enough. Anything
 * more (a shape, a cockpit, a second light) would ask to be looked at, and this
 * is meant to be seen rather than looked at.
 *
 * Wrapped rather than recycled: a lane is a loop, so a craft that leaves one end
 * of the corridor re-enters the other with everything else about it unchanged.
 * Respawning them would have the lane thin out and refill in visible clumps.
 */
function drawTraffic(
  context: CanvasRenderingContext2D,
  camera: Camera,
  craft: Craft[],
  delta: number,
  animated: boolean,
  intensity: number,
  a: Projected,
  b: Projected
): void {
  const edge = 7600

  for (const ship of craft) {
    if (animated) {
      ship.x += ship.speed * delta
      if (ship.x > edge) ship.x = -edge
      else if (ship.x < -edge) ship.x = edge
    }

    const nose = project(camera, ship.x, ship.y, ship.z, a)
    // Behind it, against its direction of travel.
    const tail = project(
      camera,
      ship.x - Math.sign(ship.speed) * ship.length * 4,
      ship.y,
      ship.z,
      b
    )
    if (!nose || !tail) continue

    const size = Math.max(1, ship.length * nose.scale)

    // The trail. Faint, and the thing that says which way it is going.
    context.globalAlpha = 0.16 * intensity
    context.strokeStyle = tint('brass', 1)
    context.lineWidth = Math.max(0.6, size * 0.28)
    context.beginPath()
    context.moveTo(tail.x, tail.y)
    context.lineTo(nose.x, nose.y)
    context.stroke()

    // The hull: a dark bar, which is all a slab reads as from here.
    context.globalAlpha = 0.55 * intensity
    context.fillStyle = tint('obsidian', 1)
    context.fillRect(nose.x - size * 0.5, nose.y - size * 0.16, size, Math.max(1, size * 0.32))

    // One lamp at the nose.
    context.globalAlpha = 0.6 * intensity
    context.fillStyle = tint('goldLit', 1)
    context.fillRect(
      nose.x + size * 0.34,
      nose.y - size * 0.1,
      Math.max(1, size * 0.2),
      Math.max(1, size * 0.2)
    )
  }

  context.globalAlpha = 1
}

/**
 * The mark, taken off its own path as a set of points.
 *
 * Sampled through `getPointAtLength` on a real SVG element rather than by
 * re-describing the artwork here as coordinates. The `d` string has exactly one
 * home — `logomark.path.ts` says so — and a second transcription of it in this
 * file would be a copy that silently stops matching the logo the day the
 * artwork changes. This asks the browser where the curve actually goes.
 *
 * The element is attached, measured and removed inside one call. A detached
 * path measures correctly in Chromium, but the spec is not on our side there
 * and a zero-length result would be a mark that never appears.
 */
function sampleSigil(): SigilNode[] {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.style.position = 'absolute'
  svg.style.opacity = '0'
  svg.style.pointerEvents = 'none'

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', LOGOMARK_PATH)
  svg.appendChild(path)
  document.body.appendChild(svg)

  const nodes: SigilNode[] = []

  try {
    const total = path.getTotalLength()
    if (total > 0) {
      // Centred on the artwork's own box, then scaled so the mark's width is
      // the width we asked for in world units.
      const scale = SIGIL_WIDTH / LOGOMARK_VIEWBOX.width
      const midX = LOGOMARK_VIEWBOX.width / 2
      const midY = LOGOMARK_VIEWBOX.height / 2

      for (let index = 0; index < SIGIL_SAMPLES; index += 1) {
        const point = path.getPointAtLength((index / SIGIL_SAMPLES) * total)
        nodes.push({
          // SVG's y grows downward and so does this scene's, so the mark goes
          // in the right way up with no flip.
          lx: (point.x - midX) * scale,
          ly: (point.y - midY) * scale,
          lz: (Math.random() - 0.5) * 7,
          phase: Math.random() * TAU,
          sx: 0,
          sy: 0,
          scale: 0
        })
      }
    }
  } catch {
    // A mark that cannot be measured is simply not drawn. It is ornament on a
    // background; nothing else in the scene depends on it.
  }

  svg.remove()
  return nodes
}

/**
 * The sigil, turning in the aperture.
 *
 * A wire rather than a fill: the points are joined to their neighbours *along
 * the path*, which traces the spiral, and then to anything else nearby, which
 * webs across the arms where they pass close. The first set draws the logo; the
 * second is what makes it a plexus and ties it to the field behind it, which
 * carries the same construction.
 *
 * Nearer nodes are brighter and larger, and that is the whole reason the
 * rotation reads. A flat mark spun about its own axis with uniform weight looks
 * like a squashing 2D shape; letting the projection light the near half is what
 * makes it a plane turning in space.
 */
function drawSigil(
  context: CanvasRenderingContext2D,
  camera: Camera,
  nodes: SigilNode[],
  sprite: HTMLCanvasElement,
  elapsed: number,
  intensity: number,
  a: Projected
): void {
  if (nodes.length === 0) return

  const angle = elapsed * SIGIL_SPIN
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  /*
   * The whole mark rises and falls.
   *
   * One slow sine on the height, well under a cycle a second. It is what makes
   * the thing read as *held* in the opening — suspended by whatever the shaft
   * is doing — rather than mounted there.
   */
  const bob = Math.sin(elapsed * SIGIL_BOB_RATE) * SIGIL_BOB

  for (const node of nodes) {
    /*
     * Each node wanders a little, on its own phase.
     *
     * Three sines at different rates so the drift never resolves into a pattern
     * the eye can follow. Applied to the *drawn* position only — the link
     * distances below are still measured on where the path put the points, so
     * membership is fixed and a wire cannot flicker in and out as a node
     * wobbles across the threshold.
     */
    const wanderX = Math.sin(elapsed * 0.9 + node.phase) * SIGIL_WANDER
    const wanderY = Math.cos(elapsed * 0.7 + node.phase * 1.3) * SIGIL_WANDER
    const wanderZ = Math.sin(elapsed * 1.1 + node.phase * 0.7) * SIGIL_WANDER

    const lx = node.lx + wanderX
    const lz = node.lz + wanderZ

    const p = project(
      camera,
      lx * cos - lz * sin,
      SIGIL_Y + bob + node.ly + wanderY,
      lx * sin + lz * cos,
      a
    )
    if (p) {
      node.sx = p.x
      node.sy = p.y
      node.scale = p.scale
    } else {
      node.scale = 0
    }
  }

  // How far round the turn we are, 0 face-on .. 1 edge-on. The mark dims as it
  // turns away, the way a lit plane does.
  const facing = 0.35 + 0.65 * Math.abs(cos)

  context.lineWidth = 1
  const reachSquared = SIGIL_REACH * SIGIL_REACH

  for (let i = 0; i < nodes.length; i += 1) {
    const from = nodes[i]
    if (from.scale === 0) continue

    // Along the path: the outline itself, closed back to the start.
    const next = nodes[(i + 1) % nodes.length]
    if (next.scale !== 0) {
      context.strokeStyle = tint('goldLit', 0.5 * facing * intensity)
      context.beginPath()
      context.moveTo(from.sx, from.sy)
      context.lineTo(next.sx, next.sy)
      context.stroke()
    }

    // Across the arms: only where the spiral genuinely passes close to itself.
    for (let j = i + 2; j < nodes.length; j += 1) {
      const to = nodes[j]
      if (to.scale === 0) continue
      const dx = from.lx - to.lx
      const dy = from.ly - to.ly
      const distance = dx * dx + dy * dy
      if (distance > reachSquared) continue

      const closeness = 1 - distance / reachSquared
      context.strokeStyle = tint('gold', closeness * closeness * 0.22 * facing * intensity)
      context.beginPath()
      context.moveTo(from.sx, from.sy)
      context.lineTo(to.sx, to.sy)
      context.stroke()
    }
  }

  for (const node of nodes) {
    if (node.scale === 0) continue
    stamp(
      context,
      sprite,
      node.sx,
      node.sy,
      Math.max(sprite.width * node.scale * 0.42, 1),
      0.5 * facing * intensity
    )
  }

  context.globalAlpha = 1
}

/** Lesser monoliths, receding. Pure silhouette — they are distance, not detail. */
function drawSkyline(
  context: CanvasRenderingContext2D,
  camera: Camera,
  distants: readonly Distant[],
  intensity: number,
  a: Projected,
  b: Projected,
  c: Projected,
  d: Projected
): void {
  // Far to near, so a nearer slab overlaps the one behind it.
  const ordered = [...distants].sort((left, right) => right.z - left.z)

  for (const slab of ordered) {
    const half = slab.width / 2
    face(
      context,
      camera,
      [
        [slab.x - half, GROUND_Y, slab.z],
        [slab.x + half, GROUND_Y, slab.z],
        [slab.x + half, GROUND_Y - slab.height, slab.z],
        [slab.x - half, GROUND_Y - slab.height, slab.z]
      ],
      tint('obsidian', 1),
      Math.max(0.12, slab.shade) * intensity,
      a,
      b,
      c,
      d
    )
  }
}

/**
 * The plain the causeway crosses.
 *
 * At eye height the ground is more than half the frame, and until this existed
 * all of it but the deck was pure black — which does not read as a dark plain,
 * it reads as the bottom of the picture being missing.
 *
 * Filled in screen space rather than as a world quad. The ground plane runs from
 * the horizon to well past the bottom of the frame and its projected outline is
 * just "everything below that line", so building a polygon for it would be
 * arithmetic in service of a rectangle. What matters is the gradient: lightest
 * at the horizon where the haze piles up, going to nothing underfoot, because
 * the only light out here is at the gate and none of it reaches this far.
 */
function drawPlain(
  context: CanvasRenderingContext2D,
  camera: Camera,
  width: number,
  height: number,
  intensity: number,
  a: Projected
): void {
  // Far enough to stand in for the vanishing point without special-casing it.
  const horizon = project(camera, 0, GROUND_Y, 400000, a)
  if (!horizon) return

  const gradient = context.createLinearGradient(0, horizon.y, 0, height)
  gradient.addColorStop(0, tint('concrete', 0.1 * intensity))
  gradient.addColorStop(0.12, tint('brass', 0.06 * intensity))
  gradient.addColorStop(0.45, tint('obsidian', 0.55))
  gradient.addColorStop(1, tint('obsidian', 0.96))

  context.globalAlpha = 1
  context.fillStyle = gradient
  context.fillRect(0, horizon.y, width, height - horizon.y)
}

/**
 * Banners hung from the lintel down the inner face of each pylon.
 *
 * Straight off the `Concrete Nexus` and `Red Sectum` boards, and they do a job
 * beyond citation: the pylons are wide, flat and vertical, and a banner is the
 * one thing that breaks that face without arguing with the ribbing.
 *
 * Crimson *glass*, not crimson light. The bright crimson in this scene belongs
 * to the shaft and to nothing else — a pair of lit banners either side of it
 * would give the composition three focal points and therefore none. These are
 * the deep, near-black crimson of the material, lit only along one edge.
 */
function drawBanners(
  context: CanvasRenderingContext2D,
  camera: Camera,
  elapsed: number,
  intensity: number,
  a: Projected,
  b: Projected,
  c: Projected,
  d: Projected
): void {
  const front = -PYLON_DEPTH / 2 - 8
  const top = LINTEL_Y + 40
  const bottom = LINTEL_Y + (GROUND_Y - LINTEL_Y) * 0.66

  for (const side of [-1, 1] as const) {
    const inner = side * (APERTURE + PYLON_WIDTH * 0.2)
    const outer = side * (APERTURE + PYLON_WIDTH * 0.38)

    // A slow lean, as cloth hanging in still air has. Tiny: any more and it
    // reads as wind, and there is no weather in this picture.
    const drift = Math.sin(elapsed * 0.26 + side) * 6

    face(
      context,
      camera,
      [
        [inner, top, front],
        [outer, top, front],
        [outer + drift, bottom, front],
        [inner + drift, bottom, front]
      ],
      tint('crimsonGlass', 1),
      // Over the pylon's lit face this was reading as a flat red panel rather
      // than as cloth hanging on stone. Let the face show through it.
      0.62,
      a,
      b,
      c,
      d
    )

    // The edge nearest the shaft catches it. One line, and the only reason the
    // banner is visible as an object rather than a darker patch of pylon.
    const lit0 = project(camera, inner, top, front, a)
    const lit1 = project(camera, inner + drift, bottom, front, b)
    if (!lit0 || !lit1) continue

    const gradient = context.createLinearGradient(lit0.x, lit0.y, lit1.x, lit1.y)
    gradient.addColorStop(0, tint('crimson', 0.22 * intensity))
    gradient.addColorStop(1, tint('crimson', 0.08 * intensity))

    context.globalAlpha = 1
    context.strokeStyle = gradient
    context.lineWidth = Math.max(1, 1.8 * lit0.scale)
    context.beginPath()
    context.moveTo(lit0.x, lit0.y)
    context.lineTo(lit1.x, lit1.y)
    context.stroke()
  }

  context.globalAlpha = 1
}

/**
 * The causeway: a deck running out of the foreground to the dais.
 *
 * The transverse courses are the scale. A plain with nothing on it gives the eye
 * no way to measure distance, and the figures alone are not enough because a
 * viewer does not know how tall they are meant to be. Courses at a known spacing
 * converging on the gate make the depth readable before anything walks on it.
 *
 * The slight downward tilt is what makes this legible at all; dead level it
 * would be a single bright line at the horizon.
 */
function drawCauseway(
  context: CanvasRenderingContext2D,
  camera: Camera,
  intensity: number,
  a: Projected,
  b: Projected
): void {
  const step = 180

  for (let z = CAUSEWAY_NEAR; z <= CAUSEWAY_FAR; z += step) {
    const left = project(camera, -CAUSEWAY_HALF, GROUND_Y, z, a)
    const right = project(camera, CAUSEWAY_HALF, GROUND_Y, z, b)
    if (!left || !right) continue

    const near = (z - CAUSEWAY_NEAR) / (CAUSEWAY_FAR - CAUSEWAY_NEAR)
    context.globalAlpha = (0.09 + (1 - near) * 0.1) * intensity
    context.strokeStyle = tint('concrete', 1)
    context.lineWidth = Math.max(0.6, 1.4 * left.scale)
    context.beginPath()
    context.moveTo(left.x, left.y)
    context.lineTo(right.x, right.y)
    context.stroke()
  }

  /*
   * The shaft's light, lying on the deck.
   *
   * Drawn as a world-space quad rather than a screen gradient so it foreshortens
   * with the deck it is lying on — light on a receding surface pools into the
   * distance, and a screen-space wash would sit flat on the frame instead.
   */
  const spillNear = project(camera, 0, GROUND_Y, -1500, a)
  const spillFar = project(camera, 0, GROUND_Y, CAUSEWAY_FAR, b)
  if (spillNear && spillFar) {
    const pool = context.createLinearGradient(spillNear.x, spillNear.y, spillFar.x, spillFar.y)
    pool.addColorStop(0, tint('crimson', 0))
    pool.addColorStop(0.55, tint('crimson', 0.09 * intensity))
    pool.addColorStop(1, tint('crimsonHot', 0.26 * intensity))

    context.globalAlpha = 1
    context.fillStyle = pool
    context.beginPath()
    const corners: [number, number, number][] = [
      [-CAUSEWAY_HALF, GROUND_Y, -1500],
      [CAUSEWAY_HALF, GROUND_Y, -1500],
      [CAUSEWAY_HALF, GROUND_Y, CAUSEWAY_FAR],
      [-CAUSEWAY_HALF, GROUND_Y, CAUSEWAY_FAR]
    ]
    let started = false
    for (const [x, y, z] of corners) {
      const p = project(camera, x, y, z, a)
      if (!p) {
        started = false
        break
      }
      if (started) context.lineTo(p.x, p.y)
      else {
        context.moveTo(p.x, p.y)
        started = true
      }
    }
    if (started) {
      context.closePath()
      context.fill()
    }
  }

  // The two edges, which are what actually converge and drag the eye up.
  for (const side of [-1, 1] as const) {
    const near = project(camera, side * CAUSEWAY_HALF, GROUND_Y, CAUSEWAY_NEAR, a)
    const far = project(camera, side * CAUSEWAY_HALF, GROUND_Y, CAUSEWAY_FAR, b)
    if (!near || !far) continue

    const gradient = context.createLinearGradient(near.x, near.y, far.x, far.y)
    gradient.addColorStop(0, tint('brass', 0.06 * intensity))
    gradient.addColorStop(0.7, tint('gold', 0.18 * intensity))
    gradient.addColorStop(1, tint('crimson', 0.34 * intensity))

    context.globalAlpha = 1
    context.strokeStyle = gradient
    context.lineWidth = 1.4
    context.beginPath()
    context.moveTo(near.x, near.y)
    context.lineTo(far.x, far.y)
    context.stroke()
  }
}

/**
 * The pillars flanking the causeway.
 *
 * Drawn far to near so a nearer pillar overlaps the one behind it, which is the
 * only thing making the run read as a corridor rather than a row of stamps.
 *
 * The inner face of each carries the same crimson wash as the pylons' — they are
 * lit by the same shaft, and lighting them from anywhere else would quietly
 * break the one light source the composition has.
 */
function drawColonnade(
  context: CanvasRenderingContext2D,
  camera: Camera,
  intensity: number,
  a: Projected,
  b: Projected,
  c: Projected,
  d: Projected
): void {
  const half = COLONNADE_WIDTH / 2
  const deep = COLONNADE_DEPTH / 2

  let bay = 0
  for (let z = CAUSEWAY_NEAR; z <= CAUSEWAY_FAR - COLONNADE_STEP; z += COLONNADE_STEP) {
    // Nearest first would hide the run behind its own first pillar.
    const at = CAUSEWAY_FAR - COLONNADE_STEP - (z - CAUSEWAY_NEAR)
    bay += 1

    /*
     * Fades with distance.
     *
     * Every pillar the same weight is the mistake that makes a receding run look
     * like a row of stamps: the far ones stay as black and as crisp as the near
     * ones, so the only cue left is size. Letting the haze take them is what
     * turns the row into a corridor with air in it.
     */
    const reach = (at - CAUSEWAY_NEAR) / (CAUSEWAY_FAR - CAUSEWAY_NEAR)
    const solidity = 0.3 + (1 - reach) * 0.65

    for (const side of [-1, 1] as const) {
      const x = side * COLONNADE_X
      const inner = x - side * half
      const outer = x + side * half
      const front = at - deep
      const back = at + deep
      const top = GROUND_Y - COLONNADE_HEIGHT

      /*
       * The face toward the camera, with its top broken away.
       *
       * A flat top is the single thing that makes a monolith look newly poured.
       * The profile is walked in five steps from the outer edge back to the
       * inner one, each bitten down by its own amount, so a pillar loses a
       * corner here and a course there instead of being evenly eroded.
       *
       * How ruined any one of them is varies: `ruin` is drawn per pillar and
       * cubed, so most of the run is only chipped and the occasional one is
       * properly wrecked. Uniform damage reads as a style applied to the whole
       * row rather than as age that happened to it.
       */
      const ruin = hash01(bay * 13.1 + side * 4.7) ** 3
      const profile: [number, number, number][] = []
      const steps = 5
      for (let k = steps; k >= 0; k -= 1) {
        const t = k / steps
        const x = inner + (outer - inner) * t
        const bite = hash01(bay * 97.3 + side * 7.9 + k * 3.3) * ruin * COLONNADE_HEIGHT * 0.42
        profile.push([x, top + bite, front])
      }

      face(
        context,
        camera,
        [[inner, GROUND_Y, front], [outer, GROUND_Y, front], ...profile],
        tint('obsidian', 1),
        0.95 * solidity,
        a,
        b,
        c,
        d
      )

      // The face toward the shaft, which is the only one with any light on it.
      face(
        context,
        camera,
        [
          [inner, GROUND_Y, front],
          [inner, GROUND_Y, back],
          [inner, top, back],
          [inner, top, front]
        ],
        tint('crimsonGlass', 1),
        0.6 * solidity,
        a,
        b,
        c,
        d
      )

      // The lit edge between the two. Four of these a side, receding, are what
      // actually draw the corridor.
      const foot = project(camera, inner, GROUND_Y, front, a)
      const head = project(camera, inner, top, front, b)
      if (!foot || !head) continue

      const gradient = context.createLinearGradient(foot.x, foot.y, head.x, head.y)
      gradient.addColorStop(0, tint('crimsonHot', 0.5 * intensity * solidity))
      gradient.addColorStop(0.4, tint('gold', 0.3 * intensity * solidity))
      gradient.addColorStop(1, tint('brass', 0.12 * intensity * solidity))

      context.globalAlpha = 1
      context.strokeStyle = gradient
      context.lineWidth = Math.max(1, 2 * foot.scale)
      context.beginPath()
      context.moveTo(foot.x, foot.y)
      context.lineTo(head.x, head.y)
      context.stroke()

      /*
       * What came off it, lying at the foot.
       *
       * Three blocks per pillar, sized off how ruined it is, so a wrecked column
       * has a heap under it and an intact one has almost nothing. Rubble that
       * does not match the damage above it is set dressing; rubble that does is
       * the reason the damage is believable.
       */
      for (let lump = 0; lump < 3; lump += 1) {
        const spread = hash01(bay * 31.7 + side * 11.3 + lump) - 0.5
        const size = (14 + hash01(bay * 53.9 + lump * 5.1) * 30) * (0.35 + ruin)
        const lx = x + spread * COLONNADE_WIDTH * 2.1
        const lz = at + (hash01(bay * 17.7 + lump * 2.9) - 0.5) * COLONNADE_DEPTH * 2.4

        face(
          context,
          camera,
          [
            [lx - size, GROUND_Y, lz],
            [lx + size, GROUND_Y, lz],
            [lx + size * 0.7, GROUND_Y - size * 0.85, lz],
            [lx - size * 0.8, GROUND_Y - size * 0.7, lz]
          ],
          tint('obsidian', 1),
          0.8 * solidity,
          a,
          b,
          c,
          d
        )
      }

      // A capital: one band near the top, so the pillar has an order to it.
      const capL = project(camera, inner, top + 34, front, a)
      const capR = project(camera, outer, top + 34, front, b)
      if (capL && capR) {
        context.globalAlpha = 0.3 * intensity * solidity
        context.strokeStyle = tint('brass', 1)
        context.lineWidth = Math.max(1, 2.4 * capL.scale)
        context.beginPath()
        context.moveTo(capL.x, capL.y)
        context.lineTo(capR.x, capR.y)
        context.stroke()
      }
    }
  }

  context.globalAlpha = 1
}

/**
 * Resonance rings, running out from where the shaft lands.
 *
 * The lore's account of Omun is that harmonic frequencies *spread*, and until
 * now every bit of that in this scene travelled up the beam and stopped. These
 * carry it outward along the ground instead, which is what makes the strike
 * point read as a source rather than as a spot where the light happens to end.
 *
 * Drawn as projected circles on the ground plane, so they foreshorten into
 * ellipses on their own. Drawing screen-space ellipses would have them sitting
 * upright on the frame like ripples on a window.
 */
function drawRings(
  context: CanvasRenderingContext2D,
  camera: Camera,
  elapsed: number,
  intensity: number,
  a: Projected
): void {
  const y = GROUND_Y - 2
  const span = 2600
  const segments = 54

  for (let ring = 0; ring < 3; ring += 1) {
    // Eased so a ring leaves the source quickly and slows as it widens, which
    // is how a wave on a surface actually behaves.
    const t = ((elapsed * 0.14 + ring / 3) % 1) ** 0.6
    const radius = 140 + t * span
    const alpha = (1 - t) ** 2 * 0.42 * intensity
    if (alpha < 0.004) continue

    context.globalAlpha = alpha
    context.strokeStyle = tint('crimson', 1)
    context.lineWidth = 1.4
    context.beginPath()

    let started = false
    for (let step = 0; step <= segments; step += 1) {
      const angle = (step / segments) * TAU
      const p = project(camera, Math.cos(angle) * radius, y, Math.sin(angle) * radius, a)
      if (!p) {
        // A ring wide enough to pass behind the lens is drawn as the arc that
        // is still in front of it rather than closed across the frame.
        started = false
        continue
      }
      if (started) context.lineTo(p.x, p.y)
      else {
        context.moveTo(p.x, p.y)
        started = true
      }
    }

    context.stroke()
  }

  context.globalAlpha = 1
}

/**
 * The floor the gate stands on, and the surface the shaft strikes.
 *
 * Drawn apart from the steps, and the split is a depth-ordering one rather than
 * a tidiness one. This slab runs from the top tread back through the aperture,
 * so it lies *behind* the beam and has to go down before it; the flight in
 * front of the gate lies *nearer* than the pylons and has to go down after
 * them. One function could not be in both places, and when it tried, whichever
 * end lost the argument painted over the other — which is how the beam ended up
 * with its foot erased by the stone it lands on.
 */
function drawPlinth(
  context: CanvasRenderingContext2D,
  camera: Camera,
  intensity: number,
  a: Projected,
  b: Projected,
  c: Projected,
  d: Projected
): void {
  const half = APERTURE + PYLON_WIDTH * 0.6
  const near = -PYLON_DEPTH / 2
  const far = PYLON_DEPTH / 2 + 120

  face(
    context,
    camera,
    [
      [-half, DAIS_TOP, near],
      [half, DAIS_TOP, near],
      [half, DAIS_TOP, far],
      [-half, DAIS_TOP, far]
    ],
    tint('obsidian', 1),
    0.9,
    a,
    b,
    c,
    d
  )

  /*
   * The shaft's light on the threshold stone.
   *
   * A world-space quad rather than a screen wash, so it foreshortens with the
   * floor it is lying on. Hottest at the axis, because that is where the column
   * comes down.
   */
  const axis = project(camera, 0, DAIS_TOP, near, a)
  const edge = project(camera, half, DAIS_TOP, near, b)
  if (!axis || !edge) return

  const pool = context.createLinearGradient(axis.x - (edge.x - axis.x), axis.y, edge.x, edge.y)
  pool.addColorStop(0, tint('crimson', 0.04 * intensity))
  pool.addColorStop(0.5, tint('crimsonHot', 0.34 * intensity))
  pool.addColorStop(1, tint('crimson', 0.04 * intensity))

  face(
    context,
    camera,
    [
      [-half, DAIS_TOP, near],
      [half, DAIS_TOP, near],
      [half, DAIS_TOP, far],
      [-half, DAIS_TOP, far]
    ],
    pool,
    1,
    a,
    b,
    c,
    d
  )
}

/**
 * The flight climbing to the threshold, seen from the bottom of it.
 *
 * Three courses, each a tread and a riser, running *toward* the viewer so the
 * risers face the lens. From an eye forty units off the plain the treads are
 * slivers and always will be — the thing that makes a flight of steps read at
 * this angle is the alternation: a dark riser, a lit nosing, a tread catching a
 * little of the shaft, and then the next one. So each of the three is drawn at
 * its own value rather than all of them in the same obsidian, and the nosings
 * carry the light.
 */
function drawSteps(
  context: CanvasRenderingContext2D,
  camera: Camera,
  intensity: number,
  a: Projected,
  b: Projected,
  c: Projected,
  d: Projected
): void {
  for (let step = 0; step < DAIS_STEPS; step += 1) {
    // Counted from the bottom. The lowest is the widest and the darkest: it is
    // furthest from the shaft and it is the one the plain runs up to.
    const near = DAIS_FOOT + step * DAIS_RUN
    const far = near + DAIS_RUN
    const tread = GROUND_Y - (step + 1) * DAIS_RISE
    const foot = GROUND_Y - step * DAIS_RISE
    const half = APERTURE + PYLON_WIDTH * 0.6 + (DAIS_STEPS - 1 - step) * DAIS_RUN * 0.22

    // The riser, square to the camera. Darkest of the three surfaces — it faces
    // the viewer, and the light is coming from above and behind it.
    face(
      context,
      camera,
      [
        [-half, foot, near],
        [half, foot, near],
        [half, tread, near],
        [-half, tread, near]
      ],
      tint('obsidian', 1),
      0.94,
      a,
      b,
      c,
      d
    )

    // The tread, lying flat and catching the shaft. Brighter the higher it is.
    face(
      context,
      camera,
      [
        [-half, tread, near],
        [half, tread, near],
        [half, tread, far],
        [-half, tread, far]
      ],
      tint('concrete', 1),
      (0.05 + step * 0.045) * intensity,
      a,
      b,
      c,
      d
    )

    /*
     * The nosing.
     *
     * The lit edge where tread meets riser, and at this angle it is doing most
     * of the work: three bright rules stacked and receding is what the eye
     * reads as stairs long before it resolves any actual surface between them.
     */
    const left = project(camera, -half, tread, near, a)
    const right = project(camera, half, tread, near, b)
    if (!left || !right) continue

    const gradient = context.createLinearGradient(left.x, left.y, right.x, right.y)
    gradient.addColorStop(0, tint('brass', 0.08 * intensity))
    gradient.addColorStop(0.34, tint('crimson', (0.3 + step * 0.1) * intensity))
    gradient.addColorStop(0.5, tint('goldHot', (0.4 + step * 0.16) * intensity))
    gradient.addColorStop(0.66, tint('crimson', (0.3 + step * 0.1) * intensity))
    gradient.addColorStop(1, tint('brass', 0.08 * intensity))

    context.globalAlpha = 1
    context.strokeStyle = gradient
    context.lineWidth = Math.max(1.2, 2.2 * left.scale)
    context.beginPath()
    context.moveTo(left.x, left.y)
    context.lineTo(right.x, right.y)
    context.stroke()

    /*
     * And the two returns at the ends of the flight.
     *
     * Each course is wider than the one above it, so the step has a short side
     * wall showing at either end. Without them the flight reads as three loose
     * bands floating on the plain rather than as one mass cut into courses.
     */
    for (const side of [-1, 1] as const) {
      const outer = half
      const inner = half - DAIS_RUN * 0.22
      face(
        context,
        camera,
        [
          [side * outer, foot, near],
          [side * inner, foot, far],
          [side * inner, tread, far],
          [side * outer, tread, near]
        ],
        tint('obsidian', 1),
        0.88,
        a,
        b,
        c,
        d
      )
    }
  }
}

/**
 * One pylon: front face, inner face, ribbing, and the lit arris between them.
 *
 * `side` is -1 for the left and 1 for the right — the same call with a mirrored
 * x, which is the cheapest possible guarantee the composition stays symmetrical.
 * There is no second block of code to drift out of step with the first.
 */
function drawPylon(
  context: CanvasRenderingContext2D,
  camera: Camera,
  side: -1 | 1,
  courses: readonly Course[],
  leanX: number,
  intensity: number,
  a: Projected,
  b: Projected,
  c: Projected,
  d: Projected
): void {
  const inner = side * APERTURE
  const outer = side * (APERTURE + PYLON_WIDTH)
  const front = -PYLON_DEPTH / 2
  const back = PYLON_DEPTH / 2
  /*
   * The slab starts on the plinth, not on the plain.
   *
   * The gate stands on the threshold floor, so its foot is that floor's height
   * and not the ground's. Run down to `GROUND_Y` instead and the bottom three
   * courses of the pylon are below the surface it is standing on — which shows
   * as a sliver of wall poking through the stone at the jamb, and as a lit
   * arris that carries on past the floor into nothing.
   */
  const base = DAIS_TOP

  /*
   * The arris, copied out of the scratch rather than held by reference.
   *
   * `project` writes into the buffer it is handed and hands that same one back,
   * and `a`, `b` and `c` are reused by every draw below this — the ribbing, the
   * cracks, the rubble. Holding the projection meant the inner arris stroked at
   * the foot of this function ran between the last rubble block's two top
   * corners: a short bright line lying on the floor, and the edge that frames
   * the shaft never drawn at all. Two numbers each, taken now.
   */
  const footInner = project(camera, inner, base, front, a)
  const arrisFoot = footInner ? { x: footInner.x, y: footInner.y, scale: footInner.scale } : null
  const headInner = project(camera, inner, LINTEL_Y, front, b)
  const arrisHead = headInner ? { x: headInner.x, y: headInner.y } : null
  const footOuter = project(camera, outer, base, front, c)
  const armOuter = footOuter ? { x: footOuter.x, y: footOuter.y } : null

  /*
   * The front face is *not* flat black.
   *
   * A silhouette on a near-black field is a hole, and a hole has no mass. The
   * face carries a faint concrete wash falling off with height — light from the
   * dais reaching the bottom of the slab and not the top — which is the whole
   * difference between a slab standing on a plain and a rectangle cut out of
   * the sky.
   */
  /*
   * The outline, with chunks gone out of the outer edge.
   *
   * Built once and used for both the fill and the clip below. Those two have to
   * be the same shape — clip to a rectangle while filling a ragged outline and
   * the ribbing carries on into the missing corners, which is worse than no
   * damage at all.
   *
   * Only the *outer* edge is bitten. The inner one is the arris that frames the
   * shaft and it is the strongest line in the composition; chewing it up would
   * cost more than the ruin is worth. The far side of the slab is against the
   * sky, so that is where a missing chunk reads anyway.
   */
  const outline: [number, number, number][] = [
    [inner, base, front],
    [outer, base, front]
  ]

  const bites = 7
  for (let bite = 0; bite <= bites; bite += 1) {
    const t = bite / bites
    const y = base - t * (PYLON_HEIGHT + base)
    // Cubed, so the edge is mostly intact with the occasional deep loss rather
    // than evenly nibbled all the way up.
    const loss = hash01(bite * 37.1 + side * 8.3) ** 3 * PYLON_WIDTH * 0.46
    outline.push([outer - side * loss, y, front])
  }
  outline.push([inner, LINTEL_Y, front])

  /*
   * Opaque first, then lit.
   *
   * This face used to be the wash alone — concrete at three tenths over
   * whatever lay behind it — and what lies behind it is the shaft's own glow,
   * stamped the better part of nine hundred pixels wide across an opening a
   * quarter of that. So the beam lit both pylons *through* their own front
   * faces: slab and gap came out at the same value, the ribbing and the haze
   * band ran straight across the opening, and the gate read as one continuous
   * wall with a line of light painted down the middle of it. A wall is opaque.
   * This is the wall.
   */
  face(context, camera, outline, tint('obsidian', 1), 0.99, a, b, c, d)

  if (arrisFoot && arrisHead) {
    const wash = context.createLinearGradient(arrisFoot.x, arrisFoot.y, arrisHead.x, arrisHead.y)
    wash.addColorStop(0, tint('concrete', 0.34 * intensity))
    wash.addColorStop(0.45, tint('concrete', 0.14 * intensity))
    wash.addColorStop(1, tint('concrete', 0.02 * intensity))

    face(context, camera, outline, wash, 1, a, b, c, d)
  }

  /*
   * And falling away from the opening.
   *
   * The only light out here is the shaft, so the stone nearest it is the stone
   * that is lit: warm at the arris, gone by the outer edge. With the face now
   * opaque this is what stops the slab being a flat grey rectangle — and it
   * does the compositional work too, because two masses that darken outward
   * leave the gap between them as the brightest thing at that height, which is
   * most of what makes a gap read as one.
   */
  if (arrisFoot && armOuter) {
    const across = context.createLinearGradient(arrisFoot.x, arrisFoot.y, armOuter.x, armOuter.y)
    across.addColorStop(0, tint('crimson', 0.26 * intensity))
    across.addColorStop(0.16, tint('crimson', 0.09 * intensity))
    across.addColorStop(0.5, tint('concrete', 0.03 * intensity))
    across.addColorStop(1, tint('obsidian', 0.4))

    face(context, camera, outline, across, 1, a, b, c, d)
  }

  // The pylon's cap. Barely in view from this height, and drawn anyway: the
  // sliver of it is what stops the slab reading as a cut-out with no thickness.
  face(
    context,
    camera,
    [
      [inner, LINTEL_Y, front],
      [outer, LINTEL_Y, front],
      [outer, LINTEL_Y, back],
      [inner, LINTEL_Y, back]
    ],
    tint('concrete', 1),
    0.1 * intensity,
    a,
    b,
    c,
    d
  )

  /*
   * How much of the inner face shows.
   *
   * Zero square on — you cannot see the inside of a wall you are facing — and
   * rising as the camera swings toward this side. Without it both inner faces
   * draw at full strength from head on and the gate reads as a flat cut-out
   * with two bright stripes painted on it.
   */
  const facing = Math.max(0, side * leanX)
  face(
    context,
    camera,
    [
      [inner, base, front],
      [inner, base, back],
      [inner, LINTEL_Y, back],
      [inner, LINTEL_Y, front]
    ],
    tint('crimsonGlass', 1),
    0.5 + facing * 0.35,
    a,
    b,
    c,
    d
  )

  // ------------------------------------------------------------------ ribbing
  //
  // Clipped to the front face. Unclipped, every course is a full-width rule
  // across the whole picture — the lines carry on past the pylon and the
  // structure stops being a structure.
  context.save()
  const corners: { x: number; y: number }[] = []
  for (const [x, y, z] of outline) {
    const p = project(camera, x, y, z, a)
    if (!p) {
      context.restore()
      return
    }
    corners.push({ x: p.x, y: p.y })
  }

  context.beginPath()
  context.moveTo(corners[0].x, corners[0].y)
  for (let index = 1; index < corners.length; index += 1) {
    context.lineTo(corners[index].x, corners[index].y)
  }
  context.closePath()
  context.clip()

  /*
   * Where the facing has come away, and the core behind it is showing.
   *
   * Irregular patches, darker than the dressed face and roughly blocky, because
   * what is behind a faced wall is rubble rather than more of the same wall.
   * This is the detail that separates *damaged* from *dirty*: a crack says the
   * stone moved, but a patch of exposed core says a piece of it is gone.
   *
   * Inside the clip, so a patch cannot spill past the slab, and drawn before
   * the ribbing so the courses run across the intact facing and stop at the
   * hole — which is the giveaway that the hole has depth.
   */
  for (let patch = 0; patch < 5; patch += 1) {
    const px = inner + (outer - inner) * (0.12 + hash01(patch * 19.7 + side * 6.1) * 0.76)
    const py = base - hash01(patch * 43.3 + side * 2.7) * (PYLON_HEIGHT + base) * 0.9
    const spread = 26 + hash01(patch * 67.1 + side) * 58

    const shape: [number, number, number][] = []
    const facets = 7
    for (let facet = 0; facet < facets; facet += 1) {
      const angle = (facet / facets) * TAU
      // Radius jitters per facet, so the patch is chipped rather than round.
      const reach = spread * (0.55 + hash01(patch * 131.7 + facet * 11.3 + side) * 0.7)
      shape.push([px + Math.cos(angle) * reach, py + Math.sin(angle) * reach * 0.78, front])
    }

    face(context, camera, shape, tint('obsidian', 1), 0.5, a, b, c, d)

    // A lip of light along the top of the break, where the broken edge of the
    // facing catches the dais.
    const lipL = project(camera, px - spread * 0.6, py - spread * 0.5, front, a)
    const lipR = project(camera, px + spread * 0.6, py - spread * 0.42, front, b)
    if (lipL && lipR) {
      context.globalAlpha = 0.16 * intensity
      context.strokeStyle = tint('concrete', 1)
      context.lineWidth = Math.max(0.6, 1.4 * lipL.scale)
      context.beginPath()
      context.moveTo(lipL.x, lipL.y)
      context.lineTo(lipR.x, lipR.y)
      context.stroke()
    }
  }

  for (const [index, course] of courses.entries()) {
    /*
     * Courses break rather than running clean.
     *
     * Most are whole. Every so often one is cut — drawn as two spans with a gap
     * where the stone has gone — and the gap sits somewhere different on each.
     * It is a small thing and it does most of the work of making the face read
     * as old, because a perfectly ruled set of courses is the signature of
     * something that has never been weathered.
     */
    const wound = hash01(index * 23.3 + side * 9.1)
    const cut = wound > 0.72
    const at = 0.2 + hash01(index * 41.7 + side * 3.3) * 0.55
    const gap = 0.06 + hash01(index * 61.3 + side) * 0.12

    const spans: [number, number][] = cut
      ? [
          [0, at - gap],
          [at + gap, 1]
        ]
      : [[0, 1]]

    context.globalAlpha = (0.16 + (1 - course.t) * 0.28) * intensity
    context.strokeStyle = tint('brass', 1)

    for (const [from, to] of spans) {
      const l = project(camera, inner + (outer - inner) * from, course.y, front, a)
      const r = project(camera, inner + (outer - inner) * to, course.y, front, b)
      if (!l || !r) continue

      context.lineWidth = Math.max(0.8, 2.2 * l.scale)
      context.beginPath()
      context.moveTo(l.x, l.y)
      context.lineTo(r.x, r.y)
      context.stroke()
    }
  }

  /*
   * Cracks, running down the face.
   *
   * Each is a polyline that wanders as it falls rather than a straight line —
   * stone fails along a path of least resistance and that path is never
   * vertical. Still inside the clip, so a crack cannot run off the slab it is
   * in, which is the mistake that would make them look like scratches on the
   * lens instead of damage to the wall.
   */
  for (let crack = 0; crack < 3; crack += 1) {
    const seedX = hash01(crack * 71.3 + side * 13.7)
    const startY = base - hash01(crack * 29.1 + side * 5.3) * (PYLON_HEIGHT + base) * 0.85
    const run = (0.25 + hash01(crack * 83.9 + side) * 0.45) * (PYLON_HEIGHT + base)

    let x = inner + (outer - inner) * (0.15 + seedX * 0.7)
    let y = startY
    let started = false

    context.globalAlpha = 0.24 * intensity
    context.strokeStyle = tint('obsidian', 1)
    context.lineWidth = Math.max(0.8, 2.6 * (camera.focal / 2600))
    context.beginPath()

    const joints = 7
    for (let joint = 0; joint <= joints; joint += 1) {
      const p = project(camera, x, y, front, a)
      if (p) {
        if (started) context.lineTo(p.x, p.y)
        else {
          context.moveTo(p.x, p.y)
          started = true
        }
      }
      x += (hash01(crack * 197.3 + joint * 7.7 + side) - 0.5) * PYLON_WIDTH * 0.22
      y += run / joints
    }

    if (started) context.stroke()
  }

  // A single vertical pilaster splitting the face, so the ribbing reads as
  // masonry rather than as a ladder.
  const pilaster = side * (APERTURE + PYLON_WIDTH * 0.52)
  const pf = project(camera, pilaster, base, front, a)
  const ph = project(camera, pilaster, LINTEL_Y, front, b)
  if (pf && ph) {
    context.globalAlpha = 0.14 * intensity
    context.strokeStyle = tint('brass', 1)
    context.lineWidth = Math.max(1, 2 * pf.scale)
    context.beginPath()
    context.moveTo(pf.x, pf.y)
    context.lineTo(ph.x, ph.y)
    context.stroke()
  }

  context.restore()

  /*
   * What came off it, on the deck below.
   *
   * Five blocks along the foot of the slab, biased toward the outer edge — that
   * is the edge with chunks missing from it, and rubble that has not fallen
   * from anywhere in particular is just clutter on the floor.
   *
   * Outside the clip: these are lying in front of the pylon, not painted on it.
   */
  for (let lump = 0; lump < 5; lump += 1) {
    const along = 0.25 + hash01(lump * 29.3 + side * 5.9) * 0.85
    const lx = inner + (outer - inner) * along
    const lz = front - 40 - hash01(lump * 71.9 + side) * 150
    const size = 16 + hash01(lump * 53.1 + side * 3.7) * 34
    const tilt = (hash01(lump * 91.7 + side) - 0.5) * 0.6
    // Resting on whichever course of the flight it fell onto, not on the plain
    // — the steps come out to meet the pylon here and a block sitting at
    // ground height would be buried in the third one.
    const rest = groundAt(lz)

    face(
      context,
      camera,
      [
        [lx - size, rest, lz],
        [lx + size, rest, lz],
        [lx + size * (0.62 + tilt), rest - size * 0.9, lz],
        [lx - size * (0.78 - tilt), rest - size * 0.72, lz]
      ],
      tint('obsidian', 1),
      0.86,
      a,
      b,
      c,
      d
    )

    // One lit edge along the top, so a block is an object and not a smudge.
    const topL = project(camera, lx - size * (0.78 - tilt), rest - size * 0.72, lz, a)
    const topR = project(camera, lx + size * (0.62 + tilt), rest - size * 0.9, lz, b)
    if (!topL || !topR) continue

    context.globalAlpha = 0.28 * intensity
    context.strokeStyle = tint('concrete', 1)
    context.lineWidth = Math.max(0.6, 1.5 * topL.scale)
    context.beginPath()
    context.moveTo(topL.x, topL.y)
    context.lineTo(topR.x, topR.y)
    context.stroke()
  }

  context.globalAlpha = 1

  /*
   * The inner arris — where the front face meets the aperture.
   *
   * The most important line in the scene. It is the only edge the shaft lights
   * directly, it is what gives the pylon a corner instead of a flat face, and
   * the pair of them frame the light. Drawn last so nothing is laid over it.
   */
  if (arrisFoot && arrisHead) {
    const gradient = context.createLinearGradient(
      arrisFoot.x,
      arrisFoot.y,
      arrisHead.x,
      arrisHead.y
    )
    gradient.addColorStop(0, tint('goldHot', 0.95 * intensity))
    gradient.addColorStop(0.22, tint('crimsonHot', 0.7 * intensity))
    gradient.addColorStop(1, tint('brass', 0.2 * intensity))

    context.globalAlpha = 1
    context.strokeStyle = gradient
    context.lineWidth = Math.max(1.4, 2.6 * arrisFoot.scale)
    context.beginPath()
    context.moveTo(arrisFoot.x, arrisFoot.y)
    context.lineTo(arrisHead.x, arrisHead.y)
    context.stroke()
  }

  context.globalAlpha = 1
}

/** The lintel, and the band of marks cut into its face. */
function drawLintel(
  context: CanvasRenderingContext2D,
  camera: Camera,
  intensity: number,
  a: Projected,
  b: Projected,
  c: Projected,
  d: Projected
): void {
  const left = -(APERTURE + PYLON_WIDTH)
  const right = APERTURE + PYLON_WIDTH
  const front = -PYLON_DEPTH / 2
  const back = PYLON_DEPTH / 2
  const top = LINTEL_Y - LINTEL_HEIGHT

  face(
    context,
    camera,
    [
      [left, LINTEL_Y, front],
      [right, LINTEL_Y, front],
      [right, top, front],
      [left, top, front]
    ],
    tint('obsidian', 1),
    0.97,
    a,
    b,
    c,
    d
  )

  // Its top surface, in view from an overlook.
  face(
    context,
    camera,
    [
      [left, top, front],
      [right, top, front],
      [right, top, back],
      [left, top, back]
    ],
    tint('concrete', 1),
    0.12 * intensity,
    a,
    b,
    c,
    d
  )

  /*
   * A register of marks across the lintel.
   *
   * Not writing, and not meant to be read. It is the one piece of ornament in
   * the scene and it is there to say the structure was *inscribed* — that
   * somebody built this deliberately and recorded something on it. A bare slab
   * is geology; a slab with a register on it is architecture.
   */
  const bandY = LINTEL_Y - LINTEL_HEIGHT * 0.5
  const marks = 34
  for (let index = 0; index < marks; index += 1) {
    const t = (index + 0.5) / marks
    const x = left + (right - left) * t
    const p = project(camera, x, bandY, front, a)
    if (!p) continue

    const major = index % 5 === 0
    const size = (major ? 13 : 7) * p.scale
    // Brightest over the aperture, falling off toward the ends — lit from below.
    const centred = 1 - Math.abs(t - 0.5) * 2
    context.globalAlpha = (0.1 + centred * 0.3) * intensity
    context.strokeStyle = tint(major ? 'gold' : 'brass', 1)
    context.lineWidth = Math.max(0.8, 1.6 * p.scale)
    context.beginPath()
    context.moveTo(p.x, p.y - size / 2)
    context.lineTo(p.x, p.y + size / 2)
    context.stroke()
  }

  // The lit underside. One line, brightest at the middle — the only thing
  // telling you the lintel is a slab with a bottom to it.
  const bl = project(camera, left, LINTEL_Y, front, a)
  const br = project(camera, right, LINTEL_Y, front, b)
  if (!bl || !br) return

  const gradient = context.createLinearGradient(bl.x, bl.y, br.x, br.y)
  gradient.addColorStop(0, tint('brass', 0.12 * intensity))
  gradient.addColorStop(0.5, tint('crimsonHot', 0.68 * intensity))
  gradient.addColorStop(1, tint('brass', 0.12 * intensity))

  context.globalAlpha = 1
  context.strokeStyle = gradient
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(bl.x, bl.y)
  context.lineTo(br.x, br.y)
  context.stroke()
}

/**
 * One thing lying on the causeway.
 *
 * Three kinds out of one function, because they are the same object at
 * different values — a shape on the deck, lit from the gate. The water is the
 * only one that is really different, and it is different in the way that
 * matters: it is the one surface in the scene that gives the shaft back.
 *
 * Nothing here is animated. The road is not doing anything; it is what the road
 * has been like for a long time.
 */
function drawDebris(
  context: CanvasRenderingContext2D,
  camera: Camera,
  piece: Debris,
  intensity: number,
  a: Projected,
  b: Projected,
  c: Projected,
  d: Projected
): void {
  const rest = groundAt(piece.z)

  if (piece.kind === 0) {
    /*
     * Standing water.
     *
     * Lifted a unit off the deck so the causeway's own ruled lines do not show
     * through it — there is no depth buffer here, so "on top of" is a matter of
     * being drawn later and being very slightly nearer the lens.
     *
     * The outline is ragged rather than elliptical. A puddle is not a shape, it
     * is the shape of the ground it is sitting in, and a clean ellipse on a
     * broken road reads as a spill of paint.
     */
    const long = piece.size
    const across = piece.size * (0.46 + hash01(piece.seed) * 0.4)

    const rim: [number, number, number][] = []
    const points = 15
    for (let step = 0; step < points; step += 1) {
      const angle = (step / points) * TAU
      const wobble = 0.74 + hash01(piece.seed + step * 7.3) * 0.5
      rim.push([
        piece.x + Math.cos(angle) * across * wobble,
        rest - 1,
        piece.z + Math.sin(angle) * long * wobble
      ])
    }

    const near = project(camera, piece.x, rest - 1, piece.z - long, a)
    const far = project(camera, piece.x, rest - 1, piece.z + long, b)
    if (!near || !far) return

    /*
     * Dark at the near edge, hot at the far one.
     *
     * Which is not decoration — it is where the light is. The only source in
     * this scene is up the road, so the far lip of a puddle catches it and the
     * near lip is looking at the underside of nothing. Get that round the wrong
     * way and the water reads as glowing rather than as reflecting.
     */
    const water = context.createLinearGradient(near.x, near.y, far.x, far.y)
    water.addColorStop(0, tint('obsidian', 0.88))
    water.addColorStop(0.5, tint('crimson', 0.16 * intensity))
    water.addColorStop(1, tint('crimsonHot', 0.36 * intensity))

    face(context, camera, rim, water, 1, a, b, c, d)

    /*
     * And the shaft in it.
     *
     * A narrow streak running away from the viewer toward the gate, in
     * `lighter` so it adds to the water rather than replacing it. Drawn as a
     * world quad so it foreshortens with the deck — a reflection lies *on* the
     * surface, and a screen-space smear would sit on the lens instead.
     */
    context.globalCompositeOperation = 'lighter'
    const glint = context.createLinearGradient(near.x, near.y, far.x, far.y)
    glint.addColorStop(0, tint('crimson', 0))
    glint.addColorStop(0.55, tint('crimson', 0.22 * intensity))
    glint.addColorStop(1, tint('goldHot', 0.3 * intensity))

    face(
      context,
      camera,
      [
        [piece.x - across * 0.13, rest - 2, piece.z - long * 0.4],
        [piece.x + across * 0.13, rest - 2, piece.z - long * 0.4],
        [piece.x + across * 0.2, rest - 2, piece.z + long * 0.86],
        [piece.x - across * 0.2, rest - 2, piece.z + long * 0.86]
      ],
      glint,
      1,
      a,
      b,
      c,
      d
    )
    context.globalCompositeOperation = 'source-over'

    // The far lip, wet. One line, and it is what tells you the surface is
    // water and not a stain.
    const lipL = project(camera, piece.x - across * 0.7, rest - 1, piece.z + long * 0.6, a)
    const lipR = project(camera, piece.x + across * 0.7, rest - 1, piece.z + long * 0.6, b)
    if (!lipL || !lipR) return

    context.globalAlpha = 0.3 * intensity
    context.strokeStyle = tint('gold', 1)
    context.lineWidth = Math.max(0.6, 1.4 * lipL.scale)
    context.beginPath()
    context.moveTo(lipL.x, lipL.y)
    context.lineTo(lipR.x, lipR.y)
    context.stroke()
    context.globalAlpha = 1
    return
  }

  /*
   * A block, or a stone.
   *
   * Same construction as the rubble at the foot of the pylons, and deliberately
   * so — this is the same stone, further from where it fell. A block is tall
   * and squared because it came off a dressed face; a stone is low and broad
   * because it is what a block turns into.
   */
  const size = piece.size
  const tall = piece.kind === 1 ? 1.05 : 0.5
  const tilt = (hash01(piece.seed * 3.1) - 0.5) * 0.66

  face(
    context,
    camera,
    [
      [piece.x - size, rest, piece.z],
      [piece.x + size, rest, piece.z],
      [piece.x + size * (0.6 + tilt), rest - size * tall, piece.z],
      [piece.x - size * (0.76 - tilt), rest - size * tall * 0.8, piece.z]
    ],
    tint('obsidian', 1),
    0.9,
    a,
    b,
    c,
    d
  )

  // A wash of crimson down the face that is turned toward the gate, so a block
  // out on the road is lit by the same thing everything else is.
  const topL = project(camera, piece.x - size * (0.76 - tilt), rest - size * tall * 0.8, piece.z, a)
  const topR = project(camera, piece.x + size * (0.6 + tilt), rest - size * tall, piece.z, b)
  if (!topL || !topR) return

  context.globalAlpha = (0.18 + hash01(piece.seed * 11.7) * 0.16) * intensity
  context.strokeStyle = tint(piece.kind === 1 ? 'concrete' : 'brass', 1)
  context.lineWidth = Math.max(0.6, 1.4 * topL.scale)
  context.beginPath()
  context.moveTo(topL.x, topL.y)
  context.lineTo(topR.x, topR.y)
  context.stroke()
  context.globalAlpha = 1
}

/**
 * One of the procession.
 *
 * A robe, and that is all: a tapered silhouette with a hood, no limbs and no
 * face. At this size detail would be noise — and the brief is explicit that the
 * figures are *"uniform in silhouette, individuality subordinate to
 * formation"*. What identifies them is the gold resonance mark every species in
 * this world carries, which here is one lit pixel.
 */
function drawPilgrim(
  context: CanvasRenderingContext2D,
  camera: Camera,
  walker: Pilgrim,
  elapsed: number,
  intensity: number,
  a: Projected
): void {
  /*
   * The stride.
   *
   * Two parts. The body rises and falls twice per cycle — a walk lifts on each
   * step, not once per pair — and sways once, because the weight shifts side to
   * side at half that rate. Getting those two rates the same way round is the
   * whole difference between walking and bobbing.
   */
  const step = elapsed * 2.1 + walker.stride
  const sway = Math.sin(step * 0.5 + walker.phase) * 2.2
  const lift = Math.abs(Math.sin(step)) * 0.022

  /*
   * The crowd narrows as it climbs.
   *
   * They are scattered across the width of the deck, which is wider than the
   * aperture — so without this the outer walkers climb the steps and walk
   * straight into the jambs. A procession entering a gate funnels, and by the
   * threshold this has pulled the whole file inside the opening.
   */
  const funnel = Math.max(0, Math.min(1, (walker.z - DAIS_FOOT) / (DAIS_STEPS * DAIS_RUN)))

  /*
   * Standing on the steps rather than through them.
   *
   * `groundAt` is the height of whatever is under this z. Pinning them to
   * `GROUND_Y` meant the ones who had reached the dais were still at plain
   * level with the flight rising through their knees — and a figure walking
   * *into* a staircase is the fastest way to tell a viewer none of it is real.
   */
  const p = project(
    camera,
    (walker.x + sway) * (1 - funnel * 0.55),
    groundAt(walker.z),
    walker.z,
    a
  )
  if (!p) return

  const h = walker.height * p.scale
  if (h < 1.5) return

  // Broader and more hooded with `build`. The hem is always wider than the
  // shoulders — it is a robe, and a robe falls outward.
  const w = h * (0.3 + walker.build * 0.1)
  const shoulder = w * (0.62 + walker.build * 0.14)
  const hood = w * (0.28 + walker.build * 0.1)

  const base = p.y - h * lift

  /*
   * Fading on and off the walk.
   *
   * They are recycled at the *near* end and walk away toward the gate, which is
   * the right direction — a procession arrives from behind you — but it also
   * means they reappear at the point where they are largest on screen. Popping
   * in at full size in the foreground was the most visible thing in the frame.
   *
   * So the first quarter of the walk is an arrival and the last eighth a
   * departure. The entry ramp is the longer of the two because it is spent at
   * close range where a figure covers real area; by the time one reaches the
   * dais it is a few pixels tall and needs almost nothing to leave quietly.
   *
   * Squared on the way in, so it holds near-invisible for a moment and then
   * resolves, rather than sitting at half-strength through the whole ramp
   * looking like a ghost.
   */
  const along = (walker.z - PROCESSION_NEAR) / (CAUSEWAY_FAR - PROCESSION_NEAR)
  const arriving = Math.min(1, along / 0.26) ** 2
  const leaving = Math.min(1, (1 - along) / 0.12)

  const presence = Math.min(1, 0.35 + p.scale * 1.4) * arriving * leaving
  if (presence < 0.01) return

  /*
   * Contact.
   *
   * A soft dark pool where the figure meets the deck. Nothing else in this
   * scene casts anything, and without it the walkers hover a pixel off the
   * ground and read as pasted onto the picture rather than standing in it. It
   * is the cheapest possible shadow and it is doing the most work of anything
   * in this function.
   */
  if (h > 3) {
    context.globalAlpha = presence * 0.5
    context.fillStyle = tint('obsidian', 1)
    context.beginPath()
    context.ellipse(p.x, p.y, w * 0.62, w * 0.2, 0, 0, TAU)
    context.fill()
  }

  /*
   * The silhouette: hem, shoulders, hood.
   *
   * Built once and both filled and stroked so the rim cannot drift off the
   * shape. The hood is a curve rather than a point — a peak is a traffic cone,
   * and the difference between the two is about fifteen pixels of radius at the
   * top of the head.
   */
  context.beginPath()
  context.moveTo(p.x - w / 2, base)
  // Up the left, bellying out where the robe falls over the leg.
  context.quadraticCurveTo(p.x - w * 0.54, base - h * 0.3, p.x - shoulder / 2, base - h * 0.58)
  // Shoulder into the crown.
  context.bezierCurveTo(
    p.x - hood * 0.95,
    base - h * 0.78,
    p.x - hood * 0.8,
    base - h,
    p.x,
    base - h
  )
  context.bezierCurveTo(
    p.x + hood * 0.8,
    base - h,
    p.x + hood * 0.95,
    base - h * 0.78,
    p.x + shoulder / 2,
    base - h * 0.58
  )
  context.quadraticCurveTo(p.x + w * 0.54, base - h * 0.3, p.x + w / 2, base)
  context.closePath()

  context.globalAlpha = presence * 0.94
  context.fillStyle = tint('obsidian', 1)
  context.fill()

  /*
   * A rim off the shaft.
   *
   * Without it these are black shapes on a nearly black deck and the procession
   * — which is the subject — is legible only where it happens to cross a lit
   * course. One hairline of the light they are all walking toward separates
   * every one of them from the ground, and it is motivated rather than added:
   * there is exactly one light source in this picture and this is it.
   */
  if (h > 4) {
    context.globalAlpha = presence * 0.22 * intensity
    context.strokeStyle = tint('crimson', 1)
    context.lineWidth = Math.max(0.6, h * 0.016)
    context.stroke()
  }

  // Cloth. Two folds down the robe, and only where there are pixels to carry
  // them — below about twenty they close up into a smudge.
  if (h > 20) {
    context.globalAlpha = presence * 0.16
    context.strokeStyle = tint('concrete', 1)
    context.lineWidth = Math.max(0.5, h * 0.012)
    for (const side of [-1, 1] as const) {
      context.beginPath()
      context.moveTo(p.x + side * w * 0.16, base - h * 0.52)
      context.quadraticCurveTo(
        p.x + side * w * 0.22,
        base - h * 0.28,
        p.x + side * w * 0.3,
        base - h * 0.04
      )
      context.stroke()
    }
  }

  // The resonance mark, at the shoulder. One warm point, and the only thing
  // separating a person from a post.
  if (h > 7) {
    context.globalAlpha = 0.32 * intensity
    context.fillStyle = tint('gold', 1)
    context.fillRect(p.x - w * 0.05, base - h * 0.62, Math.max(1, w * 0.1), Math.max(1, h * 0.028))
  }

  context.globalAlpha = 1
}

/**
 * The shaft standing in the aperture.
 *
 * Stacked quads rather than a screen-space gradient, so it inherits the
 * perspective and leans with the structure. A gradient rectangle stays bolt
 * upright while the pylons move and reads as a smudge on the lens.
 */
function drawBeam(
  context: CanvasRenderingContext2D,
  camera: Camera,
  elapsed: number,
  intensity: number,
  halo: HTMLCanvasElement,
  a: Projected,
  b: Projected
): void {
  /*
   * Two clocks, and they do different jobs.
   *
   * `breath` is the slow swell that makes the shaft feel alive. `shimmer` is a
   * fast, small instability on top of it — two sines at rates that do not
   * divide into each other, so they never line up into a pulse you can count.
   * Contained energy is never perfectly steady, and a beam that is reads as a
   * rectangle someone filled with a gradient.
   */
  const breath = 0.86 + Math.sin(elapsed * 0.5) * 0.16
  const shimmer = 0.95 + Math.sin(elapsed * 9.3) * 0.035 + Math.sin(elapsed * 21.7) * 0.015
  const radius = APERTURE * 0.34

  /*
   * A wash filling the opening, behind the column.
   *
   * The shaft was lighting itself and nothing around it, so the aperture stayed
   * as dark as the plain either side of it and the beam read as a bright line
   * on a black field rather than as something illuminating a space. This lifts
   * the air inside the gate, which is what gives the column something to be
   * brighter *than*.
   *
   * **Sized to the opening**, which it was not. At three and a half sprite
   * widths this glow came out near nine hundred pixels across — four times the
   * aperture — so it was not lighting the air inside the gate, it was lighting
   * the whole gate and a good deal of sky either side. The pylons are opaque
   * now and would clip the spill anyway; keeping it near the opening's own
   * width is what stops the gate glowing like a lamp behind frosted glass.
   */
  const middle = project(camera, 0, LINTEL_Y * 0.45, 0, a)
  if (middle) {
    stamp(
      context,
      halo,
      middle.x,
      middle.y,
      halo.width * middle.scale * 1.9,
      0.36 * intensity * breath
    )
  }

  const crown = project(camera, 0, LINTEL_Y, 0, a)
  if (crown) {
    stamp(context, halo, crown.x, crown.y, halo.width * crown.scale * 1.5, 0.3 * intensity * breath)
  }

  const segments = 24
  for (let index = 0; index < segments; index += 1) {
    const t0 = index / segments
    const t1 = (index + 1) / segments
    const y0 = DAIS_TOP - t0 * (PYLON_HEIGHT + DAIS_TOP)
    const y1 = DAIS_TOP - t1 * (PYLON_HEIGHT + DAIS_TOP)

    const low = project(camera, 0, y0, 0, a)
    const high = project(camera, 0, y1, 0, b)
    if (!low || !high) continue

    const w0 = radius * low.scale
    const w1 = radius * high.scale
    // Fed from the floor: thins as it rises.
    const alpha = (1 - t0) ** 1.4 * 0.38 * intensity * breath * shimmer

    /*
     * Across the segment, not flat.
     *
     * Filled with one colour these quads stack into a rectangle with two hard
     * vertical sides — a bar of light rather than a beam of it. A gradient
     * across each one, transparent at the edges and hot in the middle, is what
     * gives the column a round section. It is the same shape a real shaft of
     * light has for the same reason: you are seeing through more of it at the
     * centre than at the rim.
     */
    /*
     * Harmonic pulses, rising.
     *
     * Bands of brightness travelling up the column on a slow cycle, which is
     * the one piece of motion the lore explicitly asks for — Omun is a
     * *resonance*, and a shaft of light that merely sits there is a lamp. Three
     * of them, staggered, so the beam is never uniformly lit and never wholly
     * quiet.
     */
    let harmonic = 0
    for (let pulse = 0; pulse < 3; pulse += 1) {
      const at = ((elapsed * 0.17 + pulse / 3) % 1) ** 0.8
      const offset = Math.abs(t0 - at)
      if (offset > 0.16) continue
      harmonic = Math.max(harmonic, Math.cos((offset / 0.16) * (Math.PI / 2)) ** 2)
    }

    const lit = alpha * (1 + harmonic * 1.5)

    /*
     * A gold fringe at the rim.
     *
     * The palette gives crimson and gold and nothing between them, so the edge
     * of the shaft is where the two are allowed to meet: hot crimson at the
     * core, cooling outward through gold before it reaches nothing. It is the
     * only place in the scene the two materials touch, which is what makes the
     * beam read as the hottest thing in the frame rather than the reddest.
     */
    const across = context.createLinearGradient(low.x - w0, low.y, low.x + w0, low.y)
    across.addColorStop(0, tint('crimson', 0))
    across.addColorStop(0.16, tint('gold', lit * 0.35))
    across.addColorStop(0.34, tint('crimson', lit * 0.9))
    /*
     * The centre goes to `goldHot`, and that is not a palette slip.
     *
     * Hot things whiten. A core drawn in the same crimson as its own edges is
     * the reddest part of the frame but never the *brightest*, which is the
     * thing this scene needs it to be. `goldHot` is the palette's near-white
     * and it is reserved here for the few pixels at the middle of the shaft —
     * crimson everywhere around it still carries the colour.
     */
    across.addColorStop(0.46, tint('crimsonHot', lit * 2.1))
    across.addColorStop(0.5, tint('goldHot', lit * 1.5))
    across.addColorStop(0.54, tint('crimsonHot', lit * 2.1))
    across.addColorStop(0.66, tint('crimson', lit * 0.9))
    across.addColorStop(0.84, tint('gold', lit * 0.35))
    across.addColorStop(1, tint('crimson', 0))

    context.globalAlpha = 1
    context.fillStyle = across
    context.beginPath()
    context.moveTo(low.x - w0, low.y)
    context.lineTo(low.x + w0, low.y)
    context.lineTo(high.x + w1, high.y)
    context.lineTo(high.x - w1, high.y)
    context.closePath()
    context.fill()

    // A bloom stamped up the column every few segments, so the light has a
    // presence in the air either side of it rather than stopping at its edge.
    if (index % 2 === 0) {
      stamp(context, halo, low.x, low.y, halo.width * low.scale * 1.35, lit * 1.3)
    }

    /*
     * Striations inside the column.
     *
     * Two thin filaments drifting across the shaft's width. Real volumetric
     * light is never even — it is full of structure from whatever it is passing
     * through — and without them the beam is a smooth airbrushed gradient,
     * which is the one thing that always looks synthetic.
     */
    /*
     * The filament: the hottest few pixels, dead centre.
     *
     * Drawn as its own stroke rather than left to the gradient, because a
     * gradient stop that narrow is smeared away by the quad's own width at the
     * top of the column where it is thinnest. A line holds its weight all the
     * way up, which is what gives the shaft a spine.
     */
    context.globalAlpha = Math.min(1, lit * 2.6)
    context.strokeStyle = tint('goldHot', 1)
    context.lineWidth = Math.max(0.8, w0 * 0.1)
    context.beginPath()
    context.moveTo(low.x, low.y)
    context.lineTo(high.x, high.y)
    context.stroke()

    for (let strand = 0; strand < 2; strand += 1) {
      const wander = Math.sin(elapsed * 0.3 + strand * 2.2 + t0 * 3.1) * 0.46
      const sx0 = low.x + w0 * wander
      const sx1 = high.x + w1 * wander

      context.globalAlpha = lit * 0.5
      context.strokeStyle = tint('crimsonHot', 1)
      context.lineWidth = Math.max(0.6, w0 * 0.09)
      context.beginPath()
      context.moveTo(sx0, low.y)
      context.lineTo(sx1, high.y)
      context.stroke()
    }
  }

  context.globalAlpha = 1
}
