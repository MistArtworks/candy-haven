import type { RefObject } from 'react'
import type { PointerLean } from '../GenesisField'

/**
 * The four fields the NEXUS can open on.
 *
 * One is chosen when the application starts and held for the whole session.
 * They are four views of one world rather than four themes — same palette, same
 * camera, same resonance plexus running through all of them — so which one
 * comes up changes the mood of a launch without changing what the application
 * is.
 */

export interface SceneProps {
  /** Drives tint and motion: the field reports real archive health. */
  tone: 'nominal' | 'unstable'
  /**
   * Live cursor position, read every frame.
   *
   * A ref rather than a prop value: these drive a canvas, so a pointer move
   * must not re-render React. The lean is damped inside the loop.
   */
  leanRef?: RefObject<PointerLean>
  className?: string
}

export const SCENE_IDS = ['genesis', 'galaxy', 'vigil', 'detonation'] as const
export type SceneId = (typeof SCENE_IDS)[number]

export interface SceneDefinition {
  id: SceneId
  /** Shown in the corner of the landing, in the house voice. */
  label: string
  /**
   * Where the composition's focal point sits vertically, 0..1.
   *
   * The mandala armature and the type block are positioned against this, so a
   * scene whose subject is not in the middle can say so rather than having the
   * furniture laid over its face.
   */
  focusY: number
  /**
   * Whether the sacred-geometry armature belongs over this field.
   *
   * True only where there is a single centred object for it to enclose. Over
   * the vigil it would sit on the sky like a watermark, and over the ruin it
   * would ring empty space beside the planet.
   */
  mandala: boolean
}

export const SCENES: Record<SceneId, SceneDefinition> = {
  genesis: {
    id: 'genesis',
    label: 'THE SINGULARITY · HARMONIC COLLAPSE',
    focusY: 0.44,
    mandala: true
  },
  galaxy: {
    id: 'galaxy',
    label: 'THE GALACTIC SURVEY · ALL ARMS RESONANT',
    focusY: 0.46,
    mandala: false
  },
  vigil: {
    id: 'vigil',
    label: 'THE VIGIL · ONE OBSERVER, ATTENDING',
    focusY: 0.4,
    mandala: false
  },
  detonation: {
    id: 'detonation',
    label: 'THE DETONATION · RESONANCE UNBOUND',
    focusY: 0.5,
    mandala: true
  }
}

/**
 * The scene for this run of the application.
 *
 * Resolved once at module load and never again, which is the whole requirement:
 * a different field each time the app is *opened*, and a stable one while it is
 * open. Navigating away from the NEXUS and back must not reroll it — that would
 * be a slot machine rather than an atmosphere, and it would throw away a field
 * the operator was looking at.
 *
 * A module constant rather than state because the module is evaluated exactly
 * once per window. React's own lifecycle is the wrong scope: components remount
 * on every navigation.
 */
export const SESSION_SCENE: SceneId = SCENE_IDS[Math.floor(Math.random() * SCENE_IDS.length)]
