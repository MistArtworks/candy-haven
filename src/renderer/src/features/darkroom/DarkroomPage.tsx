import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { getSection } from '@shared/domain/navigation'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { notify } from '@renderer/components/feedback/notify'
import { truncatePath } from '@renderer/lib/format'
import * as shell from '@renderer/lib/shell'
import { gridVariants } from '@renderer/motion/transitions'
import { CurveEditor } from './components/CurveEditor'
import { GradeControls } from './components/GradeControls'
import { RampEditor } from './components/RampEditor'
import { Viewer } from './components/Viewer'
import { buildHistogram, samplePixels } from './lib/histogram'
import { renderToCanvas } from './lib/render'
import { useDarkroomStore } from './store'
import styles from './DarkroomPage.module.scss'

/**
 * DARKROOM — where a photograph is brought into the console's palette.
 *
 * The department exists because two images in the guide are photographs rather
 * than screenshots, and both had to be gradient-mapped onto the console ramp by
 * hand, outside the repository, because the originals are stage-lit green —
 * which rule 2 of the design language forbids outright. That treatment lived
 * only inside the two finished files. Recovering it and making it a control
 * surface means the next photograph does not have to be done from memory.
 *
 * The default grade is the recovered ramp, so an image is *already* in the
 * palette the moment it lands. Everything on the page is adjustment from there
 * rather than construction from nothing — see `CONSOLE_RAMP` for how the stops
 * were derived and what about them is measured rather than assumed.
 */
export function DarkroomPage(): ReactNode {
  const section = getSection('darkroom')
  const { grade, set, setCurve, setStops, reset, resetTone, resetCurve, resetRamp } =
    useDarkroomStore()

  const [source, setSource] = useState<ImageBitmap | null>(null)
  const [name, setName] = useState<string | null>(null)
  const [histogram, setHistogram] = useState<Float32Array | null>(null)
  const [comparing, setComparing] = useState(false)
  const [busy, setBusy] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)

  /*
   * A bitmap holds GPU-backed memory that garbage collection will not reclaim
   * on its own, so each one is closed when it is replaced and when the page
   * goes away. Dropping ten photographs into a long session otherwise keeps
   * all ten resident.
   */
  const sourceRef = useRef<ImageBitmap | null>(null)
  useEffect(() => {
    sourceRef.current = source
  }, [source])
  useEffect(() => () => sourceRef.current?.close(), [])

  const load = useCallback(async (file: File): Promise<void> => {
    try {
      const bitmap = await createImageBitmap(file)

      sourceRef.current?.close()
      setSource(bitmap)
      setName(file.name)

      const pixels = samplePixels(bitmap)
      setHistogram(pixels ? buildHistogram(pixels) : null)
    } catch {
      // A file the decoder will not take — a renamed `.txt`, a format Chromium
      // does not ship. Naming the file matters more than naming the codec.
      notify.refuse(null, {
        label: 'Not an image',
        detail: `${file.name} could not be read as an image.`
      })
    }
  }, [])

  /**
   * Exports at the source's own resolution.
   *
   * Not at preview size: the plate is fitted to the panel, and writing what it
   * happens to show would quietly hand back a downscaled photograph.
   */
  const save = async (): Promise<void> => {
    if (!source) return
    setBusy(true)
    try {
      const canvas = document.createElement('canvas')
      renderToCanvas(source, grade, canvas)

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('The image could not be encoded.')

      const bytes = new Uint8Array(await blob.arrayBuffer())
      const stem = (name ?? 'image').replace(/\.[^.]+$/, '')
      const written = await window.candy.darkroom.save(bytes, `${stem}-graded.png`)

      // A cancelled save dialog is not an event worth reporting.
      if (written) {
        notify.done('Exported', {
          detail: truncatePath(written),
          action: { label: 'Show', onClick: () => shell.reveal(written) }
        })
      }
    } catch (error) {
      notify.refuse(error, { label: 'Could not export' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div className={styles.page} variants={gridVariants} initial="hidden" animate="visible">
      <PageHeader
        index={section.order}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className={styles.fileInput}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void load(file)
                // Cleared so choosing the same file twice fires again.
                event.target.value = ''
              }}
            />
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              Open image
            </Button>
            <Button size="sm" onClick={reset} disabled={!source}>
              Reset grade
            </Button>
            <Button variant="primary" size="sm" busy={busy} disabled={!source} onClick={save}>
              Export
            </Button>
          </>
        }
      />

      <div className={styles.layout}>
        {/*
          The plate is the focal panel, and the only one. Everything else on
          this page is an instrument reading — see the design language on
          single focal objects.
        */}
        <Panel label="Plate" index="01" className={styles.platePanel} focal flush animated>
          <Viewer
            source={source}
            settings={grade}
            comparing={comparing}
            onDrop={(file) => void load(file)}
            onCompareChange={setComparing}
          />
          <div className={styles.plateFoot}>
            <span className={styles.plateName}>{name ?? 'Nothing loaded'}</span>
            {source ? (
              <span className={styles.plateSize}>
                {source.width} × {source.height}
              </span>
            ) : null}
            {source ? <span className={styles.plateHint}>Hold to compare</span> : null}
          </div>
        </Panel>

        <div className={styles.column}>
          <Panel
            label="Tone"
            index="02"
            animated
            aside={
              <Button size="sm" onClick={resetTone}>
                Rest
              </Button>
            }
          >
            <GradeControls settings={grade} onChange={set} />
          </Panel>

          <Panel
            label="Curve"
            index="03"
            animated
            aside={
              <Button size="sm" onClick={resetCurve}>
                Straighten
              </Button>
            }
          >
            <CurveEditor points={grade.curve} histogram={histogram} onChange={setCurve} />
          </Panel>

          <Panel
            label="Ramp"
            index="04"
            animated
            aside={
              <Button size="sm" onClick={resetRamp}>
                Console ramp
              </Button>
            }
          >
            <RampEditor stops={grade.stops} onChange={setStops} />
          </Panel>
        </div>
      </div>
    </motion.div>
  )
}
