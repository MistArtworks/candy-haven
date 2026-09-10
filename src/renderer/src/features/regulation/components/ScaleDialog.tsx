import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Button } from '@renderer/components/primitives/Button'
import { Portal } from '@renderer/components/primitives/Portal'
import { Slider } from '@renderer/components/primitives/Slider'
import styles from './ScaleDialog.module.scss'

/**
 * The steps offered as buttons, matching what Windows itself offers.
 *
 * A slider is kept alongside them because the useful value here is whatever
 * happens to be legible on the operator's display, not a round number — but
 * almost everyone wants one of these, and clicking is faster than aiming.
 */
const PRESETS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const

export interface ScaleDialogProps {
  /** The scale currently in force. */
  value: number
  onApply: (scale: number) => void
  onCancel: () => void
}

/**
 * Interface scale, chosen against a contained preview.
 *
 * This exists because the obvious design does not work. Interface scale is
 * applied as the frame's zoom factor, so a slider wired straight to it rescales
 * the page *while it is being dragged* — including the slider, which slides out
 * from under the pointer. At 150% the thumb has moved half a panel away from
 * where the operator grabbed it.
 *
 * So the choice is made here instead, against a sample that scales while the
 * console around it does not. Nothing reaches the frame until APPLY. The
 * preview uses CSS `zoom` rather than a transform deliberately: `zoom` reflows
 * its contents exactly as the frame's zoom factor will, so what the operator
 * judges is what they get. A `transform: scale()` would resample a
 * 100%-laid-out box and misrepresent both the line breaks and the hairlines.
 */
export function ScaleDialog({ value, onApply, onCancel }: ScaleDialogProps): ReactNode {
  const [scale, setScale] = useState(value)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const percent = Math.round(scale * 100)

  return (
    <Portal>
      <div
        className={styles.scrim}
        role="presentation"
        onClick={(event) => {
          if (event.target === event.currentTarget) onCancel()
        }}
      >
        <motion.div
          className={styles.dialog}
          role="dialog"
          aria-modal="true"
          aria-label="Interface scale"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <header className={styles.head}>
            <span className={styles.title}>Interface scale</span>
            <span className={styles.current}>{percent}%</span>
          </header>

          <div className={styles.body}>
            <div className={styles.presets} role="group" aria-label="Scale presets">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={styles.preset}
                  data-selected={Math.abs(preset - scale) < 0.001 || undefined}
                  aria-pressed={Math.abs(preset - scale) < 0.001}
                  onClick={() => setScale(preset)}
                >
                  {Math.round(preset * 100)}%
                </button>
              ))}
            </div>

            <Slider
              label="Fine adjustment"
              min={0.8}
              max={2}
              step={0.05}
              value={scale}
              readout={`${percent}%`}
              onChange={setScale}
            />

            {/*
              The preview is a real fragment of the console rather than lorem
              text: the smallest type in this interface is the numbered panel
              label and the mono readout, and those are exactly what the
              operator is trying to judge. A paragraph of body copy would look
              perfectly legible at every setting and answer nothing.
            */}
            <div className={styles.previewFrame}>
              <span className={styles.previewLabel}>Preview</span>

              <div className={styles.preview}>
                <div className={styles.sample} style={{ zoom: scale }}>
                  <div className={styles.sampleHead}>
                    <span className={styles.sampleIndex}>01</span>
                    <span className={styles.sampleTitle}>Set analysis</span>
                  </div>

                  <div className={styles.sampleFields}>
                    <div>
                      <span className={styles.sampleFieldLabel}>Tempo</span>
                      <span className={styles.sampleFieldValue}>145</span>
                    </div>
                    <div>
                      <span className={styles.sampleFieldLabel}>Key</span>
                      <span className={styles.sampleFieldValue}>D# Minor</span>
                    </div>
                    <div>
                      <span className={styles.sampleFieldLabel}>Length</span>
                      <span className={styles.sampleFieldValue}>3:03</span>
                    </div>
                  </div>

                  <p className={styles.sampleBody}>
                    A loop, a sample, a direction. Nothing committed yet.
                  </p>
                </div>
              </div>
            </div>

            <p className={styles.note}>
              Applies to the whole console at once. Above about 150% on a 1080p display, panels
              begin to scroll rather than shrink.
            </p>
          </div>

          <div className={styles.actions}>
            <Button size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={Math.abs(scale - value) < 0.001}
              onClick={() => onApply(scale)}
            >
              Apply {percent}%
            </Button>
          </div>
        </motion.div>
      </div>
    </Portal>
  )
}
