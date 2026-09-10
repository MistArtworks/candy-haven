/* eslint-disable react-refresh/only-export-components --
 * This is a Vite entry point, not a component module. It calls `createRoot` at
 * the bottom, so the rule's premise — that the file is imported and its exports
 * hot-swapped — does not hold. `main.tsx` is the same shape and avoids the rule
 * only by having nothing to define.
 */
import { createRoot } from 'react-dom/client'
import { useRef, type ReactNode } from 'react'
import { GenesisField, type PointerLean } from '@renderer/features/home/components/GenesisField'
import { GalaxyScene } from '@renderer/features/home/components/scenes/GalaxyScene'
import { VigilScene } from '@renderer/features/home/components/scenes/VigilScene'
import { DetonationScene } from '@renderer/features/home/components/scenes/DetonationScene'
import { SCENES } from '@renderer/features/home/components/scenes/scenes'
import '@renderer/styles/global.scss'

/**
 * A contact sheet of the four landing fields.
 *
 * Not shipped and not reachable from the application — it exists so the scenes
 * can be *looked at* side by side, at a fixed aspect, without launching the
 * console and waiting on a database. Composition is the whole point of these
 * and composition cannot be verified by a type checker.
 *
 * Built as its own Vite entry; see `electron.vite.config.ts`.
 */

function Cell({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div
      style={{
        position: 'relative',
        aspectRatio: '16 / 9',
        background: '#0c0c0c',
        overflow: 'hidden'
      }}
    >
      {children}
      <span
        style={{
          position: 'absolute',
          left: 12,
          bottom: 10,
          font: '600 10px/1 ui-monospace, monospace',
          letterSpacing: '0.18em',
          color: '#d2a961',
          textTransform: 'uppercase'
        }}
      >
        {label}
      </span>
    </div>
  )
}

function Sheet(): ReactNode {
  const lean = useRef<PointerLean>({ x: 0, y: 0 })

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 2,
        background: '#000',
        padding: 2
      }}
    >
      <Cell label={SCENES.genesis.label}>
        <GenesisField tone="nominal" leanRef={lean} />
      </Cell>
      <Cell label={SCENES.galaxy.label}>
        <GalaxyScene tone="nominal" leanRef={lean} />
      </Cell>
      <Cell label={SCENES.vigil.label}>
        <VigilScene tone="nominal" leanRef={lean} />
      </Cell>
      <Cell label={SCENES.detonation.label}>
        <DetonationScene tone="nominal" leanRef={lean} />
      </Cell>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Sheet />)
