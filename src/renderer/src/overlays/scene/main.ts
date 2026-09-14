import { createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { GateScene } from '@renderer/features/home/components/scenes/GateScene'
import { GalaxyScene } from '@renderer/features/home/components/scenes/GalaxyScene'
import type { SceneProps } from '@renderer/features/home/components/scenes/scenes'
import { sceneMarque } from '@shared/domain/overlays'
import './scene.scss'

/**
 * The scene-backed browser sources.
 *
 * The one overlay that mounts React. Every other browser source in the kit is
 * plain TypeScript driving a canvas, and that is the right shape for them: they
 * redraw live state at sixty frames a second and a component tree would be
 * overhead with nothing to show for it.
 *
 * This one is different because the drawing already exists. `GateScene` is the
 * NEXUS landing field — a causeway, a portal and a procession, drawn on one
 * canvas with no 3D engine — and it is a React component holding its own
 * animation loop. Re-implementing three thousand lines of arithmetic as a bare
 * renderer to avoid one `createRoot` would be copying the hard part to avoid
 * the easy one, and the two copies would drift the first time the scene was
 * touched.
 *
 * Like THE ENCLOSURE, it holds no state in the main process: the address it is
 * loaded at is the whole configuration.
 */

const params = new URLSearchParams(window.location.search)

function text(id: string, value: string | null, fallback: string, limit: number): void {
  const node = document.querySelector<HTMLElement>(`#${id}`)
  if (!node) return
  // `textContent`, never `innerHTML`: these arrive from a query string, and a
  // scene that renders markup from its own URL is an injection waiting for
  // somebody to paste the wrong link into OBS.
  const resolved = (value ?? '').trim() || fallback
  node.textContent = resolved.slice(0, limit).toUpperCase()
}

const slug = window.location.pathname.replace(/^\/+/, '').split('/')[0]
const marque = sceneMarque(slug)

text('title', params.get('title'), marque.title, 48)
text('sub', params.get('sub'), marque.sub, 64)

/** A 0..1 query value, or the fallback when absent or unreadable. */
function ratio(name: string, fallback: number): number {
  const raw = Number.parseFloat(params.get(name) ?? '')
  if (!Number.isFinite(raw)) return fallback
  return Math.min(Math.max(raw, 0), 1)
}

/**
 * A `#rrggbb` from the address, or the fallback.
 *
 * Validated rather than trusted: the value is written into a CSS custom
 * property, and an unchecked string there can close the declaration and open
 * another. Anything that is not a plain hex colour is refused outright.
 */
function colour(name: string, fallback: string): string {
  const raw = (params.get(name) ?? '').trim()
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : fallback
}

const root = document.documentElement

/*
 * The reserved band, and the gradient behind it.
 *
 * The rest of the kit holds this band *clear* so a chat capture can be
 * composited into it. Here it is painted, because this scene is what the
 * audience is looking at while they wait — a chat panel over bare artwork is
 * unreadable, and a flat slab over it hides the causeway the scene is about.
 * A gradient does both jobs: solid enough at the top to carry text, gone by the
 * bottom so the road still runs out of the frame.
 */
root.style.setProperty('--ch-scene-gap', String(ratio('gap', 0.26)))
root.style.setProperty('--ch-scene-grad-top', colour('g1', '#08080a'))
root.style.setProperty('--ch-scene-grad-bottom', colour('g2', '#08080a'))
root.style.setProperty('--ch-scene-grad-alpha', String(ratio('galpha', 0.92)))

/** A 0.5–2.0 multiplier, matching the bounds the rest of the kit uses. */
function multiplier(name: string, fallback: number): number {
  const raw = Number.parseFloat(params.get(name) ?? '')
  if (!Number.isFinite(raw)) return fallback
  return Math.min(Math.max(raw, 0.5), 2)
}

// The kit's shared knobs, as query parameters rather than a stored config.
root.style.setProperty('--ch-scene-scale', String(multiplier('scale', 1)))
root.style.setProperty('--ch-scene-type', String(multiplier('type', 1)))
root.style.setProperty('--ch-scene-opacity', String(ratio('opacity', 1)))

if (params.get('gap') === '0') root.dataset.nogap = 'true'

const host = document.querySelector<HTMLDivElement>('#scene')
if (!host) throw new Error('Gate scene host missing.')

/**
 * Which field this address shows.
 *
 * Read from the path rather than a query parameter, the way the two countdowns
 * pick their timer: the address the console hands over is then the whole
 * configuration, and a source is identified by its URL and nothing else.
 */
const SCENES: Record<string, (props: SceneProps) => ReactNode> = {
  gate: GateScene,
  survey: GalaxyScene
}

// Falls back rather than failing: a source pointed straight at the document
// should draw something recognisable instead of a blank scene.
const Scene = SCENES[slug] ?? GateScene

/*
 * `tone` is fixed at nominal.
 *
 * On the NEXUS it reports real archive health, which is a diagnostic for the
 * operator. On a broadcast it would be telling an audience waiting for a stream
 * that something is wrong with a database they cannot see and do not have.
 */
createRoot(host).render(createElement(Scene, { tone: 'nominal' }))
