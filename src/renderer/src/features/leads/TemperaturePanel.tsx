import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { TEMPERATURE_BANDS, temperatureBand } from '@shared/domain/leads.constants'
import { TemperatureSlider } from './TemperatureSlider'
import { temperatureColour, type TemperatureReading } from './model'
import styles from './Leads.module.scss'

/** How long the slider has to rest before a drag is saved. */
const SETTLE_MS = 300

type Control = 'slider' | 'steps'

/** Which control was last used, kept for the next lead opened. */
const CONTROL_KEY = 'candy.leads.temperatureControl'

export interface TemperaturePanelProps {
  reading: TemperatureReading
  disabled?: boolean
  /** Pins it; null goes back to following the interactions. */
  onSet: (value: number | null) => void
  /** The value being dragged to, before it's saved; null when at rest. */
  onPreview?: (value: number | null) => void
}

/**
 * Setting a lead's temperature by hand, on the slider or as steps, as the
 * approved prototype has it.
 *
 * The slider holds its own value while it's dragged and saves once it
 * rests, so a drag is one write rather than a hundred; the orb follows the
 * held value meanwhile (see `onPreview`). Steps are the stage strip's answer
 * from the ARCHIVE's dossier: every named stop, one press each.
 */
export function TemperaturePanel({
  reading,
  disabled = false,
  onSet,
  onPreview
}: TemperaturePanelProps): ReactNode {
  const [control, setControl] = useState<Control>(readControl)
  const [held, setHeld] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Whatever is pending is saved on the way out, as useEchoedText does.
  const latest = useRef({ held, onSet })
  useEffect(() => {
    latest.current = { held, onSet }
  })
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      const { held: pending, onSet: save } = latest.current
      if (pending !== null) save(pending)
    },
    []
  )

  const value = held ?? reading.value

  const hold = (next: number): void => {
    setHeld(next)
    onPreview?.(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      onSet(next)
      setHeld(null)
      onPreview?.(null)
    }, SETTLE_MS)
  }

  const choose = (next: Control): void => {
    setControl(next)
    try {
      localStorage.setItem(CONTROL_KEY, next)
    } catch {
      // A preference, not a record: losing it costs a click.
    }
  }

  return (
    <div className={styles.temperature}>
      <div className={styles.temperatureHead}>
        <span className={styles.fieldLabel}>Temperature</span>
        <div className={styles.switch} role="group" aria-label="Control">
          {(['slider', 'steps'] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              aria-pressed={control === entry}
              onClick={() => choose(entry)}
            >
              {entry === 'slider' ? 'Slider' : 'Steps'}
            </button>
          ))}
        </div>
      </div>

      {control === 'slider' ? (
        <TemperatureSlider
          value={value}
          automatic={reading.automatic}
          pinned={reading.pinned || held !== null}
          disabled={disabled}
          onChange={hold}
          onAutomatic={() => onSet(null)}
        />
      ) : (
        <>
          <div className={styles.steps} role="group" aria-label="Temperature steps">
            {TEMPERATURE_BANDS.map((band) => (
              <button
                key={band.value}
                type="button"
                className={styles.tempStep}
                style={{ '--c': temperatureColour(band.value) } as CSSProperties}
                aria-pressed={temperatureBand(value).value === band.value}
                data-current={temperatureBand(value).value === band.value || undefined}
                disabled={disabled}
                onClick={() => onSet(band.value)}
              >
                <span className={styles.tempStepValue}>{String(band.value).padStart(3, '0')}%</span>
                <span className={styles.tempStepLabel}>{band.label}</span>
                <span className={styles.tempStepSwatch} aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className={styles.sourceRow}>
            <span className={styles.sourceChip} data-manual={reading.pinned || undefined}>
              <span className={styles.sourceDot} aria-hidden="true" />
              {reading.pinned ? 'Set by you' : 'From your interactions'}
            </span>
            {reading.pinned ? (
              <button
                type="button"
                className={styles.textButton}
                disabled={disabled}
                onClick={() => onSet(null)}
              >
                Back to automatic
              </button>
            ) : null}
          </div>
        </>
      )}
      <p className={styles.temperatureHint}>
        {reading.pinned
          ? `Your interactions alone would put them at ${Math.round(reading.automatic)}%.`
          : 'Logging an interaction warms it; quiet weeks cool it.'}
      </p>
    </div>
  )
}

function readControl(): Control {
  try {
    return localStorage.getItem(CONTROL_KEY) === 'steps' ? 'steps' : 'slider'
  } catch {
    return 'slider'
  }
}
