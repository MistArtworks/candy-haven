import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import type { GradeSettings } from '@shared/domain/darkroom'
import { applyGrade } from '../lib/render'
import styles from '../DarkroomPage.module.scss'

export interface ViewerProps {
  source: ImageBitmap | null
  settings: GradeSettings
  /** True while the pointer is held down: draws the untouched original. */
  comparing: boolean
  onDrop: (file: File) => void
  onCompareChange: (comparing: boolean) => void
}

/** The longest edge the preview will draw. Beyond this, fitting is invisible. */
const PREVIEW_LIMIT = 1400

/**
 * The plate: the image under the grade, and the only focal object on the page.
 *
 * Drawn on a canvas rather than as an `<img>` with CSS filters, because CSS
 * cannot express a gradient map and approximating one with `sepia` and
 * `hue-rotate` would put a different image on screen from the one that exports.
 *
 * The preview renders at a **capped** size while the export renders at the
 * source's own — fitting is a display concern. `applyGrade` is shared between
 * the two, so the only difference is the number of pixels it walks.
 *
 * Holding the pointer down shows the original. A toggle would have done, but
 * hold-to-compare is the gesture every grading tool uses and it keeps the
 * comparison momentary, which is what makes it useful: the operator is checking
 * a difference, not switching between two states they have to keep track of.
 */
export function Viewer({
  source,
  settings,
  comparing,
  onDrop,
  onCompareChange
}: ViewerProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [over, setOver] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !source) return

    const scale = Math.min(1, PREVIEW_LIMIT / Math.max(source.width, source.height))
    const width = Math.max(1, Math.round(source.width * scale))
    const height = Math.max(1, Math.round(source.height * scale))

    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return

    context.clearRect(0, 0, width, height)
    context.drawImage(source, 0, 0, width, height)

    // Comparing draws the bitmap and stops — the original is what it is, and
    // running it through a grade with `amount` at zero would be the same
    // picture arrived at more slowly.
    if (comparing) return

    const image = context.getImageData(0, 0, width, height)
    applyGrade(image, settings)
    context.putImageData(image, 0, 0)
  }, [source, settings, comparing])

  const accept = (event: DragEvent): void => {
    event.preventDefault()
    setOver(false)
    const file = event.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) onDrop(file)
  }

  return (
    <div
      className={styles.plate}
      data-over={over || undefined}
      data-empty={!source || undefined}
      onDragOver={(event) => {
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={accept}
    >
      {source ? (
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          // Pointer rather than mouse, so a pen or touch compares too. The
          // leave and cancel handlers matter: releasing outside the canvas
          // would otherwise strand the preview showing the original.
          onPointerDown={() => onCompareChange(true)}
          onPointerUp={() => onCompareChange(false)}
          onPointerLeave={() => onCompareChange(false)}
          onPointerCancel={() => onCompareChange(false)}
        />
      ) : (
        <div className={styles.empty}>
          <span className={styles.emptyTitle}>Drop a photograph here</span>
          <span className={styles.emptyHint}>
            It lands on the console ramp immediately. Everything after that is adjustment.
          </span>
        </div>
      )}

      {comparing && source ? <span className={styles.compareFlag}>ORIGINAL</span> : null}
    </div>
  )
}
