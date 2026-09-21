import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { getOverlay, overlaySourceUrl, sceneMarque, type OverlayId } from '@shared/domain/overlays'
import { PRESENTATION_LIMITS } from '@shared/domain/presentation'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Slider } from '@renderer/components/primitives/Slider'
import { TextInput } from '@renderer/components/primitives/Input'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { gridVariants } from '@renderer/motion/transitions'
import { useOverlayInfo } from '@renderer/hooks/useRite'
import { useCopy } from '@renderer/hooks/useCopy'
import { GateScene } from '@renderer/features/home/components/scenes/GateScene'
import { GalaxyScene } from '@renderer/features/home/components/scenes/GalaxyScene'
import { AddressList } from '../../components/AddressList'
import { kitNumber } from '../../lib/kit'
import type { AddressRow } from '../../lib/addresses'
import styles from './ScenePage.module.scss'

const TITLE_LIMIT = 48
const SUB_LIMIT = 64

/** The fields each scene draws behind its marque. */
const SCENES = { gate: GateScene, survey: GalaxyScene } as const

const COMMON = {
  gap: 0.26,
  gradTop: '#08080a',
  gradBottom: '#08080a',
  gradAlpha: 0.92,
  scale: 1,
  type: 1,
  opacity: 1
}

/**
 * Host surface for THE GATE.
 *
 * A composer, like THE ENCLOSURE's: the scene holds no state in the main
 * process, so there is nothing here to start or stop. What is built on this
 * page is an address, and pasting it into OBS is what applies it.
 *
 * The preview is the real scene rather than a mock-up — it is a component, so
 * the page can simply mount it. What the preview cannot show is the animation
 * at broadcast size, which is why the address is offered alongside it.
 */
export interface ScenePageProps {
  overlayId: OverlayId
}

export function ScenePage({ overlayId }: ScenePageProps): ReactNode {
  const overlay = getOverlay(overlayId)
  const server = useOverlayInfo()

  // One page for every scene-backed overlay; the id chooses the field and the
  // marque it starts with, and nothing else differs.
  const Scene = SCENES[overlayId as keyof typeof SCENES] ?? GateScene
  /*
   * Stable for the life of the instance, and the router remounts per overlay.
   *
   * Both halves matter. Without the memo the URL builder below closes over a
   * fresh object every render and its dependency list cannot be honest about
   * it; without the `key` on the route, React would reuse this component when
   * walking from one scene to the other and the `useState` initialisers would
   * keep the previous scene's marque.
   */
  const DEFAULTS = useMemo(() => ({ ...COMMON, ...sceneMarque(overlay.slug) }), [overlay.slug])

  const [title, setTitle] = useState(DEFAULTS.title)
  const [sub, setSub] = useState(DEFAULTS.sub)
  const [gap, setGap] = useState(DEFAULTS.gap)
  const [gradTop, setGradTop] = useState(DEFAULTS.gradTop)
  const [gradBottom, setGradBottom] = useState(DEFAULTS.gradBottom)
  const [gradAlpha, setGradAlpha] = useState(DEFAULTS.gradAlpha)
  const [scale, setScale] = useState(DEFAULTS.scale)
  const [type, setType] = useState(DEFAULTS.type)
  const [opacity, setOpacity] = useState(DEFAULTS.opacity)
  const copier = useCopy()

  const adjusted =
    title !== DEFAULTS.title ||
    sub !== DEFAULTS.sub ||
    gap !== DEFAULTS.gap ||
    gradTop !== DEFAULTS.gradTop ||
    gradBottom !== DEFAULTS.gradBottom ||
    gradAlpha !== DEFAULTS.gradAlpha ||
    scale !== DEFAULTS.scale ||
    type !== DEFAULTS.type ||
    opacity !== DEFAULTS.opacity

  function reset(): void {
    setTitle(DEFAULTS.title)
    setSub(DEFAULTS.sub)
    setGap(DEFAULTS.gap)
    setGradTop(DEFAULTS.gradTop)
    setGradBottom(DEFAULTS.gradBottom)
    setGradAlpha(DEFAULTS.gradAlpha)
    setScale(DEFAULTS.scale)
    setType(DEFAULTS.type)
    setOpacity(DEFAULTS.opacity)
  }

  /*
   * Only what differs from the default is written into the address.
   *
   * A URL carrying every parameter at its default is longer, harder to read at
   * a glance in OBS, and implies the operator chose nine things when they chose
   * none. Absent means default in the overlay, so the short form is the honest
   * one.
   */
  const sourceUrl = useMemo(() => {
    if (!server.url) return null
    const url = new URL(overlaySourceUrl(server.url, overlay))

    if (title.trim() && title !== DEFAULTS.title) url.searchParams.set('title', title.trim())
    if (sub.trim() && sub !== DEFAULTS.sub) url.searchParams.set('sub', sub.trim())
    if (gap !== DEFAULTS.gap) url.searchParams.set('gap', gap.toFixed(2))
    if (gradTop !== DEFAULTS.gradTop) url.searchParams.set('g1', gradTop)
    if (gradBottom !== DEFAULTS.gradBottom) url.searchParams.set('g2', gradBottom)
    if (gradAlpha !== DEFAULTS.gradAlpha) url.searchParams.set('galpha', gradAlpha.toFixed(2))
    if (scale !== DEFAULTS.scale) url.searchParams.set('scale', scale.toFixed(2))
    if (type !== DEFAULTS.type) url.searchParams.set('type', type.toFixed(2))
    if (opacity !== DEFAULTS.opacity) url.searchParams.set('opacity', opacity.toFixed(2))

    return url.toString()
  }, [
    server.url,
    overlay,
    DEFAULTS,
    title,
    sub,
    gap,
    gradTop,
    gradBottom,
    gradAlpha,
    scale,
    type,
    opacity
  ])

  /** The one address, as the kit's own address row. */
  const rows = useMemo<AddressRow[]>(
    () =>
      sourceUrl
        ? [
            {
              key: overlay.slug,
              label: overlay.label,
              purpose: overlay.sourcePurpose ?? overlay.purpose,
              canvas: overlay.canvas,
              url: sourceUrl
            }
          ]
        : [],
    [overlay, sourceUrl]
  )

  return (
    <div className={styles.page}>
      <PageHeader
        index={kitNumber(overlayId)}
        label={overlay.label}
        kind={overlay.role}
        purpose={overlay.purpose}
        epigraph={overlay.epigraph}
        actions={
          <div className={styles.headerActions}>
            <Link to="/observatory" className={styles.back}>
              ← The desk
            </Link>
            <StatusDot
              tone={server.url ? 'online' : 'pending'}
              label={server.url ? 'Serving' : 'Server offline'}
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
        <div className={styles.columns}>
          <div className={styles.column}>
            {/* The scene is the single focal object on this page. */}
            <Panel label="Scene" index="01" focal>
              <div
                className={styles.stage}
                style={
                  {
                    '--ch-scene-gap': String(gap),
                    '--ch-scene-grad-top': gradTop,
                    '--ch-scene-grad-bottom': gradBottom,
                    '--ch-scene-grad-alpha': String(gradAlpha),
                    '--ch-scene-scale': String(scale),
                    '--ch-scene-type': String(type),
                    opacity
                  } as React.CSSProperties
                }
              >
                <Scene tone="nominal" className={styles.scene} />
                <div className={styles.chat} />
                <div className={styles.marque}>
                  <span className={styles.title}>
                    {(title.trim() || DEFAULTS.title).slice(0, TITLE_LIMIT).toUpperCase()}
                  </span>
                  <span className={styles.sub}>
                    {(sub.trim() || DEFAULTS.sub).slice(0, SUB_LIMIT).toUpperCase()}
                  </span>
                </div>
              </div>
            </Panel>

            <Panel label="Chat band" index="03">
              <div className={styles.fields}>
                <Slider
                  label="Band width"
                  value={gap}
                  min={0}
                  max={0.5}
                  step={0.01}
                  onChange={setGap}
                  readout={gap === 0 ? 'None' : `${Math.round(gap * 100)}%`}
                  hint="The share of the frame held for a chat capture. Zero removes it."
                  width="full"
                />

                <div className={styles.swatches}>
                  <label className={styles.swatch}>
                    <span className={styles.swatchLabel}>Top colour</span>
                    <input
                      type="color"
                      aria-label="Gradient top colour"
                      value={gradTop}
                      onChange={(event) => setGradTop(event.target.value)}
                    />
                  </label>
                  <label className={styles.swatch}>
                    <span className={styles.swatchLabel}>Lower colour</span>
                    <input
                      type="color"
                      aria-label="Gradient lower colour"
                      value={gradBottom}
                      onChange={(event) => setGradBottom(event.target.value)}
                    />
                  </label>
                </div>

                <Slider
                  label="Band strength"
                  value={gradAlpha}
                  min={0}
                  max={1}
                  step={0.02}
                  onChange={setGradAlpha}
                  readout={`${Math.round(gradAlpha * 100)}%`}
                  hint="The band always fades out by the bottom, whatever the colours."
                  width="full"
                />

                <div className={styles.actions}>
                  <Button size="sm" variant="ghost" onClick={reset} disabled={!adjusted}>
                    Reset to defaults
                  </Button>
                </div>
              </div>
            </Panel>
          </div>
          <div className={styles.column}>
            <Panel label="Marque" index="02">
              <div className={styles.fields}>
                <TextInput
                  label="Title"
                  value={title}
                  maxLength={TITLE_LIMIT}
                  onChange={setTitle}
                  placeholder={DEFAULTS.title}
                  hint="Uppercased on the scene."
                />
                <TextInput
                  label="Second line"
                  value={sub}
                  maxLength={SUB_LIMIT}
                  onChange={setSub}
                  placeholder={DEFAULTS.sub}
                  hint="Set beneath the title, quieter."
                />

                <Slider
                  label="Scale"
                  value={scale}
                  min={PRESENTATION_LIMITS.scale.min}
                  max={PRESENTATION_LIMITS.scale.max}
                  step={PRESENTATION_LIMITS.scale.step}
                  onChange={setScale}
                  readout={`${scale.toFixed(2)}×`}
                  width="full"
                />
                <Slider
                  label="Type size"
                  value={type}
                  min={PRESENTATION_LIMITS.typeScale.min}
                  max={PRESENTATION_LIMITS.typeScale.max}
                  step={PRESENTATION_LIMITS.typeScale.step}
                  onChange={setType}
                  readout={`${type.toFixed(2)}×`}
                  width="full"
                />
                <Slider
                  label="Opacity"
                  value={opacity}
                  min={PRESENTATION_LIMITS.opacity.min}
                  max={PRESENTATION_LIMITS.opacity.max}
                  step={PRESENTATION_LIMITS.opacity.step}
                  onChange={setOpacity}
                  readout={`${Math.round(opacity * 100)}%`}
                  width="full"
                />
              </div>
            </Panel>

            <Panel label="Broadcast" index="04">
              <div className={styles.broadcast}>
                <p className={styles.hint}>
                  This one is a <strong>scene</strong> rather than furniture — it replaces the
                  capture rather than sitting over it, so it does not want Transparent ticked.
                  Everything set above travels in the address, so changing one means pasting the new
                  URL rather than reloading the source.
                </p>

                {/*
              The shared list, given the *composed* address rather than the
              registry's bare one.

              Every other overlay in the kit stores its settings and serves one
              fixed URL. This page has no stored state at all — the URL *is* the
              configuration, which is what lets two scenes carry two
              differently-marqued copies — so the row is built here from what the
              fields say. The presentation, the copy and the preview are the
              kit's; only the address is this page's.
            */}
                <AddressList
                  rows={rows}
                  copied={copier.copied}
                  failed={copier.failed}
                  onCopy={copier.copy}
                  offline="Overlay server offline — no address to serve."
                />
              </div>
            </Panel>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
