import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { RampStop } from '@shared/domain/darkroom'
import { buildRampTable, toHex } from '@shared/domain/darkroom'
import { Button } from '@renderer/components/primitives/Button'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import styles from '../DarkroomPage.module.scss'

export interface RampEditorProps {
  stops: RampStop[]
  onChange: (stops: RampStop[]) => void
}

/**
 * The console palette, as the ramp's own vocabulary.
 *
 * These are the values in `styles/base/_theme.scss`, in the order the ladder
 * climbs. Offering the palette rather than a colour wheel is the point: rule 1
 * of the design language is that the console has five colours, and a free
 * picker here would make this the one department able to break it.
 */
const PALETTE: readonly { name: string; hex: string }[] = [
  { name: 'Obsidian 900', hex: '#08080a' },
  { name: 'Obsidian 700', hex: '#111011' },
  { name: 'Crimson 900', hex: '#24090a' },
  { name: 'Crimson 800', hex: '#43120f' },
  { name: 'Crimson 700', hex: '#5e1a16' },
  { name: 'Crimson 600', hex: '#7a1e1a' },
  { name: 'Crimson 500', hex: '#a32b23' },
  { name: 'Crimson 400', hex: '#c4453a' },
  { name: 'Brass 700', hex: '#45351f' },
  { name: 'Gold 500', hex: '#976b30' },
  { name: 'Gold 400', hex: '#b98b47' },
  { name: 'Gold 300', hex: '#d2a961' },
  { name: 'Gold 200', hex: '#e3c286' },
  { name: 'Alabaster 500', hex: '#b69e7c' },
  { name: 'Alabaster 400', hex: '#cdb994' },
  { name: 'Alabaster 300', hex: '#ddcfb2' }
]

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value)

/**
 * The gradient map itself: which colours, and where along the tonal range.
 *
 * The bar is the ramp as it will be applied — drawn from `buildRampTable`, the
 * same function that grades the image, so what is under the operator's finger
 * is the thing itself rather than a CSS approximation of it. A
 * `linear-gradient` would be close and would diverge exactly where the stops
 * bunch up, which is where the operator is looking hardest.
 *
 * Shadows sit at the left, highlights at the right.
 */
export function RampEditor({ stops, onChange }: RampEditorProps): ReactNode {
  const barRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState(0)
  const [dragging, setDragging] = useState<number | null>(null)

  const sorted = [...stops].sort((a, b) => a.position - b.position)
  const active = Math.min(selected, sorted.length - 1)

  // The ramp rendered as it is actually computed, painted into a gradient with
  // a stop every 4 steps — dense enough that the eye cannot find the seams.
  const table = buildRampTable(sorted)
  const swatches: string[] = []
  for (let i = 0; i < 256; i += 4) {
    swatches.push(
      `${toHex(table[i * 3], table[i * 3 + 1], table[i * 3 + 2])} ${((i / 255) * 100).toFixed(1)}%`
    )
  }
  const barStyle = { backgroundImage: `linear-gradient(90deg, ${swatches.join(', ')})` }

  const positionAt = (event: ReactPointerEvent): number | null => {
    const bar = barRef.current
    if (!bar) return null
    const box = bar.getBoundingClientRect()
    return clamp01((event.clientX - box.left) / box.width)
  }

  const onPointerMove = (event: ReactPointerEvent): void => {
    if (dragging === null) return
    const position = positionAt(event)
    if (position === null) return

    const moved = sorted.map((stop, index) => (index === dragging ? { ...stop, position } : stop))
    const reordered = [...moved].sort((a, b) => a.position - b.position)

    // Dragging one stop past another reorders the array, so the index being
    // dragged has to follow the stop rather than the slot it started in.
    setDragging(reordered.indexOf(moved[dragging]))
    setSelected(reordered.indexOf(moved[dragging]))
    onChange(reordered)
  }

  const addStop = (event: ReactPointerEvent): void => {
    const position = positionAt(event)
    if (position === null) return
    if (sorted.some((stop) => Math.abs(stop.position - position) < 0.02)) return

    // Born the colour the ramp already is at that point, so adding a stop
    // changes nothing until it is moved. A stop that recolours the image the
    // instant it appears makes the bar hostile to explore.
    const index = Math.round(position * 255) * 3
    const colour = toHex(table[index], table[index + 1], table[index + 2])

    const next = [...sorted, { colour, position }].sort((a, b) => a.position - b.position)
    onChange(next)
    setSelected(next.findIndex((stop) => stop.position === position))
  }

  const recolour = (hex: string): void => {
    onChange(sorted.map((stop, index) => (index === active ? { ...stop, colour: hex } : stop)))
  }

  const removeStop = (): void => {
    // Two is the floor: one colour is not a gradient, and zero is not anything.
    if (sorted.length <= 2) return
    onChange(sorted.filter((_, index) => index !== active))
    setSelected(Math.max(0, active - 1))
  }

  return (
    <div className={styles.rampWrap}>
      <div
        ref={barRef}
        className={styles.rampBar}
        style={barStyle}
        role="application"
        aria-label="Gradient ramp"
        onPointerDown={addStop}
        onPointerMove={onPointerMove}
        onPointerUp={() => setDragging(null)}
        onPointerCancel={() => setDragging(null)}
      >
        {sorted.map((stop, index) => (
          <button
            key={index}
            type="button"
            className={styles.rampStop}
            data-active={index === active || undefined}
            style={{ left: `${stop.position * 100}%`, '--stop-colour': stop.colour } as never}
            aria-label={`Stop ${index + 1}, ${stop.colour}`}
            onPointerDown={(event) => {
              event.stopPropagation()
              event.currentTarget.setPointerCapture(event.pointerId)
              setSelected(index)
              setDragging(index)
            }}
            onPointerMove={onPointerMove}
            onPointerUp={() => setDragging(null)}
          />
        ))}
      </div>

      <div className={styles.rampMeta}>
        <span className={styles.rampMetaLabel}>
          Stop {active + 1} of {sorted.length}
        </span>
        <span className={styles.rampMetaValue}>
          {sorted[active]?.colour} · {Math.round((sorted[active]?.position ?? 0) * 100)}%
        </span>
        <Button size="sm" onClick={removeStop} disabled={sorted.length <= 2}>
          Remove
        </Button>
      </div>

      <div className={styles.swatches} role="group" aria-label="Palette">
        {PALETTE.map((entry) => (
          <button
            key={entry.hex}
            type="button"
            className={styles.swatch}
            style={{ background: entry.hex }}
            {...tooltipTrigger(`${entry.name} · ${entry.hex}`)}
            aria-label={entry.name}
            data-on={sorted[active]?.colour === entry.hex || undefined}
            onClick={() => recolour(entry.hex)}
          />
        ))}
      </div>

      <p className={styles.hint}>
        Click the bar to add a stop, drag to move it, then pick its colour from the palette. Shadows
        on the left, highlights on the right.
      </p>
    </div>
  )
}
