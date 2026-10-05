import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { TEMPERATURE_BANDS, temperatureBand } from '@shared/domain/leads.constants'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import { temperatureColour } from './orb'
import styles from './TemperatureSlider.module.scss'

export interface TemperatureSliderProps {
  /** 0 to 100: the temperature as it stands, set by hand or worked out. */
  value: number
  /** Where the logged interactions put it. Marked on the track while pinned. */
  automatic: number
  /** Set by hand, so it no longer follows the interactions. */
  pinned: boolean
  disabled?: boolean
  /** Every step of a drag, an arrow key, or a click on a named stop. */
  onChange: (value: number) => void
  /** Hands it back to the interactions. */
  onAutomatic: () => void
}

const clamp = (value: number): number => Math.min(100, Math.max(0, value))

/** A point on the scale, for the stylesheet to place along the track. */
const along = (value: number): CSSProperties => ({ '--p': clamp(value) / 100 }) as CSSProperties

/**
 * A lead's temperature, set by hand.
 *
 * A thick ramp from frozen to supernova, a tall thumb glowing in the colour of
 * where it stands, a bubble with the value, and the named stops beneath. While
 * it's pinned, a marker shows where the interactions would put it, and the row
 * under it offers the way back. The native range does the work, so the keyboard
 * does what it always does.
 */
export function TemperatureSlider({
  value,
  automatic,
  pinned,
  disabled = false,
  onChange,
  onAutomatic
}: TemperatureSliderProps): ReactNode {
  const bubbleRef = useRef<HTMLSpanElement>(null)
  const percent = Math.round(clamp(value))
  const band = temperatureBand(percent)

  /*
   * The bubble rides over the thumb but stays on the track at either end. The
   * stylesheet does both, given half the bubble's width, and that only changes
   * with its text. The observer hands it over before the change is painted.
   */
  useLayoutEffect(() => {
    const bubble = bubbleRef.current
    if (!bubble) return
    const observer = new ResizeObserver(() => {
      bubble.style.setProperty('--half', `${bubble.offsetWidth / 2}px`)
    })
    observer.observe(bubble)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      className={styles.slider}
      data-disabled={disabled || undefined}
      style={{ '--temp': temperatureColour(value) } as CSSProperties}
    >
      <div className={styles.rail}>
        <span ref={bubbleRef} className={styles.bubble} style={along(percent)} aria-hidden="true">
          {percent}% · {band.label}
        </span>
        {pinned ? (
          <span className={styles.ghost} style={along(automatic)} aria-hidden="true" />
        ) : null}
        <input
          type="range"
          className={styles.range}
          min={0}
          max={100}
          step={1}
          value={percent}
          disabled={disabled}
          aria-label="Temperature"
          aria-valuetext={`${percent}%, ${band.label}`}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <div className={styles.stops}>
          {TEMPERATURE_BANDS.map((stop, index) => (
            <button
              key={stop.value}
              type="button"
              className={styles.stop}
              // Frozen, Neutral and Supernova are named at any width; the
              // stops between give their names up when it's narrow.
              data-minor={index % 3 === 0 ? undefined : true}
              style={along(stop.value)}
              aria-label={`${stop.label}, ${stop.value}%`}
              aria-pressed={stop.value === band.value}
              disabled={disabled}
              onClick={() => onChange(stop.value)}
            >
              <span className={styles.stopLabel}>{stop.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.source}>
        <span className={styles.chip} data-manual={pinned || undefined}>
          <span className={styles.dot} aria-hidden="true" />
          {pinned ? 'Set by you' : 'From your interactions'}
        </span>
        {pinned ? (
          <button
            type="button"
            className={styles.textButton}
            disabled={disabled}
            onClick={onAutomatic}
            // The marker can't be pointed at, so what it means is said here.
            {...tooltipTrigger(
              `Back to ${Math.round(clamp(automatic))}%, where your interactions put it`
            )}
          >
            Back to automatic
          </button>
        ) : null}
      </div>
    </div>
  )
}
