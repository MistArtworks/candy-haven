/* eslint-disable react-refresh/only-export-components --
 * A Vite entry point, not a component module. See preview/scenes.tsx.
 */
import { createRoot } from 'react-dom/client'
import { useEffect, useRef, type ReactNode } from 'react'
import type { MusterState } from '@shared/domain/muster'
import type { MusterLayout } from '@shared/domain/muster.constants'
import { createEmptyMusterState } from '@shared/domain/muster.constants'
import { MusterFace } from '@renderer/muster/muster-renderer'
import '@renderer/styles/global.scss'

/**
 * THE MUSTER, at both addresses, with a call in progress.
 *
 * Not shipped and not reachable from the application. It exists so the two
 * layouts can be *looked at* against a full roll without running a stream and
 * asking ten people to type — composition is what these are for, and a type
 * checker has nothing to say about it.
 */

const PEOPLE = [
  'VELVETIRIS',
  'KORVAN_9',
  'NYXORI_DEV',
  'SIL_TAA',
  'AEVUM_DRIFTS',
  'MIREN_SPORE',
  'CONCRETE_NEXUS',
  'OMUN_WITNESS',
  'RESONANT_04',
  'HOLLOW_CHOIR'
]

const SONGS = [
  'Lean On — DJ Snake',
  'Midnight City',
  'Strobe',
  'Opus',
  'Tadow',
  'Nightcall',
  'Innerbloom',
  'Genesis',
  'Faded',
  'Silhouettes',
  'Latch',
  'Breathe',
  'Alive',
  'Resonance'
]

function sample(): MusterState {
  const now = Date.now()
  const base = createEmptyMusterState()

  return {
    ...base,
    phase: 'open',
    prompt: 'GIVE ME SOMETHING TO PLAY',
    entries: SONGS.map((text, index) => ({
      id: `e${index}`,
      text,
      author: PEOPLE[index % PEOPLE.length],
      authorId: `u${index}`,
      // Staggered into the past so only the last one still carries its flare.
      at: now - (SONGS.length - index) * 1400
    })),
    citizens: 10,
    openedAt: now - 46_000,
    closesAt: now + 74_000,
    revision: 1
  }
}

function Face({
  layout,
  width,
  height
}: {
  layout: MusterLayout
  width: string
  height: string
}): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const face = new MusterFace(element, { motion: true, layout })
    face.setState(sample())
    face.start()

    const observer = new ResizeObserver(() => face.resize())
    observer.observe(element)

    return () => {
      observer.disconnect()
      face.destroy()
    }
  }, [layout])

  return <canvas ref={ref} style={{ display: 'block', width, height, background: '#000' }} />
}

createRoot(document.getElementById('root')!).render(
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '1fr 470px',
      gap: 4,
      padding: 4,
      background: '#000'
    }}
  >
    <Face layout="full" width="100%" height="620px" />
    <Face layout="widget" width="460px" height="380px" />
  </div>
)
