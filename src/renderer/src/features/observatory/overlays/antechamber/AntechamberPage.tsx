import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import type { AntechamberConfig, AntechamberState } from '@shared/domain/antechamber'
import {
  ANTECHAMBER_CANVAS,
  ANTECHAMBER_PALETTES,
  ANTECHAMBER_PALETTE_LABEL,
  createAntechamberState
} from '@shared/domain/antechamber.constants'
import { getOverlay, overlaySourceUrl } from '@shared/domain/overlays'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { Slider } from '@renderer/components/primitives/Slider'
import { Checkbox, SelectInput } from '@renderer/components/primitives/Input'
import { useAnimationsEnabled } from '@renderer/hooks/useMotionPreference'
import { gridVariants } from '@renderer/motion/transitions'
import { useOverlayInfo } from '@renderer/hooks/useRite'
import { AntechamberFace } from '@renderer/antechamber/antechamber-renderer'
import styles from './AntechamberPage.module.scss'

/**
 * THE ANTECHAMBER — host surface.
 *
 * The field a broadcast opens on. There is nothing live to drive here, so the
 * page is a preview and a set of dials: what the operator is doing is looking
 * at it until it is right, which is why the preview is the focal object and
 * takes the whole first row.
 *
 * Every control writes straight through. Unlike the text fields elsewhere in
 * the kit these are all discrete — a slider, a checkbox, a select — and a
 * round trip cannot eat a keystroke that was never typed.
 */
export function AntechamberPage(): ReactNode {
  const overlay = getOverlay('antechamber')
  const server = useOverlayInfo()

  const [state, setState] = useState<AntechamberState>(createAntechamberState)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    void window.candy.antechamber.state().then((next) => {
      if (alive) setState(next)
    })
    const unsubscribe = window.candy.antechamber.onState(setState)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  const config = state.config
  const set = (patch: Partial<AntechamberConfig>): void => {
    void window.candy.antechamber.configure(patch)
  }

  const sourceUrl = server.url ? overlaySourceUrl(server.url, overlay) : null

  const copy = (): void => {
    if (!sourceUrl) return
    void navigator.clipboard.writeText(sourceUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <div className={styles.page}>
      <PageHeader
        index={overlay.order + 1}
        label={overlay.label}
        purpose={overlay.purpose}
        epigraph={overlay.epigraph}
        actions={
          <div className={styles.headerActions}>
            <Link to="/observatory" className={styles.back}>
              Catalogue
            </Link>
            <StatusDot
              tone={server.running ? 'online' : 'error'}
              label={server.running ? 'Serving' : 'Server offline'}
            />
          </div>
        }
      />

      <motion.div
        className={styles.grid}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        <Panel label="The field" index="01" focal className={styles.facePanel}>
          <FieldPreview config={config} />
        </Panel>

        <Panel label="Composition" index="02" className={styles.span3}>
          <div className={styles.config}>
            <SelectInput
              label="Palette"
              value={config.palette}
              options={ANTECHAMBER_PALETTES.map((palette) => ({
                value: palette,
                label: ANTECHAMBER_PALETTE_LABEL[palette]
              }))}
              onChange={(palette) => set({ palette })}
              hint="Two materials, always from the house set. This is the whole frame rather than furniture over one, so a stray hue would be the only thing anybody saw."
            />

            <Slider
              label="Intensity"
              min={0.2}
              max={1}
              step={0.05}
              value={config.intensity}
              readout={`${Math.round(config.intensity * 100)}%`}
              onChange={(intensity) => set({ intensity })}
              hint="How strongly everything is drawn. Lower makes a backdrop something can sit on top of."
            />

            <Slider
              label="Speed"
              min={0.1}
              max={2}
              step={0.05}
              value={config.speed}
              readout={`${config.speed.toFixed(2)}×`}
              onChange={(speed) => set({ speed })}
              hint="Slower reads as weather; faster reads as a screensaver. It is meant to be barely moving."
            />

            <Slider
              label="Density"
              min={0.3}
              max={2}
              step={0.1}
              value={config.density}
              readout={`${config.density.toFixed(1)}×`}
              onChange={(density) => set({ density })}
              hint="Node and ribbon counts. The one dial that costs frames — the field's connections are quadratic in the node count."
            />

            <Slider
              label="Vignette"
              min={0}
              max={1}
              step={0.05}
              value={config.vignette}
              readout={`${Math.round(config.vignette * 100)}%`}
              onChange={(vignette) => set({ vignette })}
            />
          </div>
        </Panel>

        <Panel label="Layers" index="03" className={styles.span3}>
          <div className={styles.config}>
            <div className={styles.toggles}>
              <Checkbox
                label="Ribbons"
                checked={config.ribbons}
                onChange={(ribbons) => set({ ribbons })}
                hint="Long bands drifting across the frame."
              />
              <Checkbox
                label="Field"
                checked={config.field}
                onChange={(field) => set({ field })}
                hint="Drifting nodes that connect when they come close."
              />
              <Checkbox
                label="Rings"
                checked={config.rings}
                onChange={(rings) => set({ rings })}
                hint="Pulses expanding from the wandering focus."
              />
              <Checkbox
                label="Grain"
                checked={config.grain}
                onChange={(grain) => set({ grain })}
                hint="Worth leaving on: it dithers the wash so a stream encoder does not band it into stripes."
              />
              <Checkbox
                label="Composite over the scene"
                checked={config.transparent}
                onChange={(transparent) => set({ transparent })}
                hint="Drops the backdrop. Off by default — this is normally the bottom of a scene rather than something laid over one."
              />
            </div>

            <div className={styles.actions}>
              <Button size="sm" onClick={() => void window.candy.antechamber.reset()}>
                Reset to defaults
              </Button>
            </div>
          </div>
        </Panel>

        <Panel
          label="Broadcast source"
          index="04"
          className={styles.wide}
          aside={
            <StatusDot
              tone={server.running ? 'online' : 'error'}
              label={server.running ? 'Serving' : 'Offline'}
            />
          }
        >
          <div className={styles.broadcast}>
            {sourceUrl ? (
              <>
                <p className={styles.hint}>
                  Add a Browser source in OBS at this address, sized to your canvas —{' '}
                  {ANTECHAMBER_CANVAS.width} × {ANTECHAMBER_CANVAS.height} for a standard scene. Put
                  it at the <strong>bottom</strong> of the layer stack and composite the countdown,
                  the chat and NOW TRANSMITTING over it; this source deliberately carries none of
                  them.
                </p>
                <code className={styles.url}>{sourceUrl}</code>
                <div className={styles.broadcastActions}>
                  <Button size="sm" variant="ghost" onClick={copy}>
                    {copied ? 'Copied' : 'Copy address'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void window.candy.shell.openExternal(sourceUrl)}
                  >
                    Preview
                  </Button>
                </div>
              </>
            ) : (
              <p className={styles.hint}>
                {server.error ?? 'The overlay server is not listening.'}
              </p>
            )}

            <FieldGrid columns={3}>
              <Field label="Palette" value={config.palette.toUpperCase()} mono />
              <Field label="Speed" value={`${config.speed.toFixed(2)}x`} mono />
              <Field label="Density" value={`${config.density.toFixed(1)}x`} mono />
            </FieldGrid>
          </div>
        </Panel>
      </motion.div>
    </div>
  )
}

/**
 * The field, live, at the aspect of the recommended source.
 *
 * The same renderer the browser source uses, so what is judged here is what
 * goes out — the one thing a preview has to get right.
 */
function FieldPreview({ config }: { config: AntechamberConfig }): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const faceRef = useRef<AntechamberFace | null>(null)
  const animationsEnabled = useAnimationsEnabled()

  useEffect(() => {
    const element = canvasRef.current
    if (!element) return

    const face = new AntechamberFace(element, config, { motion: animationsEnabled })
    faceRef.current = face
    face.start()

    const observer = new ResizeObserver(() => face.resize())
    observer.observe(element)

    return () => {
      observer.disconnect()
      face.destroy()
      faceRef.current = null
    }
    // Built once. Config changes go through `setConfig` below rather than
    // rebuilding the face, which would restart every drift from zero on every
    // nudge of a slider — and tuning is exactly a series of small nudges.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animationsEnabled])

  useEffect(() => {
    faceRef.current?.setConfig(config)
  }, [config])

  return (
    <div
      className={styles.stage}
      style={{ aspectRatio: `${ANTECHAMBER_CANVAS.width} / ${ANTECHAMBER_CANVAS.height}` }}
    >
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
    </div>
  )
}
