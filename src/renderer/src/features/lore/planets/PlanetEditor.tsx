import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { planetUsers, sameLook, type LorePlanet, type LoreState } from '@shared/domain/lore'
import { LORE_LIMITS } from '@shared/domain/lore.constants'
import {
  HEAVY_SHAPES,
  LAYER_TYPES,
  MAX_LAYERS,
  MOTION_LABEL,
  blankPlanet,
  drawPlanet,
  planetSpecSchema,
  type Layer,
  type PlanetSpec
} from '@shared/planets/engine'
import { PlanetSvg } from '@shared/planets/react'
import { useSystemStore } from '@renderer/app/store/system.store'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import type { LoreActions } from '@renderer/hooks/useLore'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import { clearBackup, readBackup, writeBackup } from '../lib/backup'
import { formatRelative, timeOf } from '../lib/format'
import { useDragOrder } from '../lib/order'
import { AddLayerDialog } from './AddLayerDialog'
import { LayerControls } from './LayerControls'
import { PlanetSettings } from './PlanetSettings'
import {
  inOrder,
  shuffled,
  shuffledAll,
  withCopy,
  withLayer,
  withNewLayer,
  withParams,
  without
} from './edit'
import styles from '../Lore.module.scss'

interface Working {
  name: string
  spec: PlanetSpec
}

const sameWork = (a: Working, b: Working): boolean => a.name === b.name && sameLook(a.spec, b.spec)

function asWorking(value: unknown): Working | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as { name?: unknown; spec?: unknown }
  const spec = planetSpecSchema.safeParse(raw.spec)
  return typeof raw.name === 'string' && spec.success ? { name: raw.name, spec: spec.data } : null
}

/** How long changes keep folding into one undo step: a slider dragged is one step, not fifty. */
const UNDO_FOLD_MS = 600
const UNDO_DEPTH = 50

const PLANET = 'planet'

const BARE = blankPlanet()
const ALONE = new WeakMap<Layer, PlanetSpec>()

/** A layer on its own on a bare planet, for its row in the list: made once per version of it. */
function alone(layer: Layer): PlanetSpec {
  let spec = ALONE.get(layer)
  if (!spec) {
    spec = { ...BARE, layers: [{ ...layer, visible: true }] }
    ALONE.set(layer, spec)
  }
  return spec
}

function Icon({ d }: { d: string }): ReactNode {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.1" strokeLinecap="square" />
    </svg>
  )
}

const ICON = {
  shown:
    'M1 6s1.8-3.2 5-3.2S11 6 11 6 9.2 9.2 6 9.2 1 6 1 6Zm5 1.4a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Z',
  hidden: 'M1 6s1.8-3.2 5-3.2S11 6 11 6 9.2 9.2 6 9.2 1 6 1 6ZM2 10 10 2',
  locked: 'M3 5.5h6v4.5H3zM4.2 5.5V4a1.8 1.8 0 0 1 3.6 0v1.5',
  open: 'M3 5.5h6v4.5H3zM4.2 5.5V4a1.8 1.8 0 0 1 3.5-.6',
  copy: 'M4 4h6v6H4zM2 8V2h6',
  remove: 'M2.5 2.5l7 7M9.5 2.5l-7 7'
}

/**
 * One planet from the library, being made.
 *
 * Two sides: what it looks like, and what's being changed. On the left
 * its name, the planet as the website will draw it (moving, or paused),
 * Shuffle all and Undo, and its layers, top first, as they stack, each
 * with a picture of itself. On the right whatever is picked: a layer's
 * settings, or the planet's own surface, rim and shade, folded into
 * sections so only what's being changed is open. Saved here, on this PC, through the console's
 * unsaved-changes bar; a chapter drawn with it shows as changed until the
 * chapter is published again, since the website keeps the copy it was
 * published with.
 *
 * Every change can be undone (the button, or Ctrl+Z outside a text
 * field); changes in quick succession, like a slider dragged, fold into
 * one step.
 */
export function PlanetEditor({
  planet,
  state,
  actions,
  onOpen,
  onDeleted
}: {
  planet: LorePlanet
  state: LoreState
  actions: LoreActions
  onOpen: (id: string) => void
  onDeleted: () => void
}): ReactNode {
  const backupKey = `lore-planet:${planet.id}`
  const base: Working = useMemo(
    () => ({ name: planet.name, spec: planet.spec }),
    [planet.name, planet.spec]
  )
  const [restored] = useState(() => {
    const backup = asWorking(readBackup(backupKey))
    return backup && !sameWork(backup, base) ? backup : null
  })
  const [work, setWork] = useState<Working>(() => restored ?? base)
  const dirty = !sameWork(work, base)

  // Saved under the page with nothing unsaved here: the page follows.
  const [previousBase, setPreviousBase] = useState(base)
  if (previousBase !== base) {
    setPreviousBase(base)
    if (sameWork(work, previousBase)) setWork(base)
  }

  useEffect(() => {
    if (!dirty) {
      clearBackup(backupKey)
      return
    }
    const timer = window.setTimeout(() => writeBackup(backupKey, work), 400)
    return () => window.clearTimeout(timer)
  }, [dirty, work, backupKey])

  // ------------------------------------------------------------------ undo

  const [trail, setTrail] = useState<Working[]>([])
  const lastChange = useRef(0)
  const change = (next: Working): void => {
    const at = Date.now()
    if (at - lastChange.current > UNDO_FOLD_MS) {
      setTrail((steps) => [...steps.slice(1 - UNDO_DEPTH), work])
    }
    lastChange.current = at
    setWork(next)
  }
  const undo = (): void => {
    const previous = trail.at(-1)
    if (!previous) return
    setTrail((steps) => steps.slice(0, -1))
    lastChange.current = 0
    setWork(previous)
  }
  const setSpec = (spec: PlanetSpec): void => change({ ...work, spec })

  // ------------------------------------------------------------- the layers

  const layers = work.spec.layers
  const topFirst = useMemo(() => [...layers].reverse(), [layers])
  const [picked, setPicked] = useState<string>(() => layers.at(-1)?.id ?? PLANET)
  const pickedLayer = layers.find((layer) => layer.id === picked) ?? null
  const showing = pickedLayer ? picked : PLANET
  const full = layers.length >= MAX_LAYERS

  const drag = useDragOrder(
    topFirst.map((layer) => layer.id),
    (ids) => setSpec(inOrder(work.spec, [...ids].reverse()))
  )

  const setLayer = (id: string, patch: Partial<Layer>): void =>
    setSpec(withLayer(work.spec, id, patch))

  const [adding, setAdding] = useState(false)
  const [still, setStill] = useState(false)
  const drawing = useMemo(() => drawPlanet(work.spec), [work.spec])
  const heavy = drawing.shapes > HEAVY_SHAPES

  // ------------------------------------------------------------- the file

  const name = work.name.trim()
  const save = async (): Promise<void> => {
    if (!name) return
    const sent = work
    const saved = await actions.savePlanet({ id: planet.id, draft: { name, spec: work.spec } })
    if (!saved) return
    clearBackup(backupKey)
    // The name as kept, trimmed, so nothing reads as unsaved after.
    setWork((current) => (current === sent ? { ...current, name } : current))
  }
  const discard = (): void => {
    setWork(base)
    setTrail([])
    clearBackup(backupKey)
  }

  const setUnsaved = useSystemStore((s) => s.setUnsaved)
  const latest = useRef({ save, discard })
  useEffect(() => {
    latest.current = { save, discard }
  })
  const saving = actions.pending === 'save-planet'
  const subject = `the planet "${name || 'Unnamed'}"`
  const error = name ? null : 'A planet needs a name.'
  useEffect(() => {
    setUnsaved({
      dirty,
      saving,
      error,
      subject,
      save: () => void latest.current.save(),
      discard: () => latest.current.discard()
    })
  }, [dirty, saving, error, subject, setUnsaved])
  useEffect(() => () => setUnsaved(null), [setUnsaved])

  const users = planetUsers(state, planet.id)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const savedAt = timeOf(planet.updatedAt)

  const duplicate = async (): Promise<void> => {
    const created = await actions.createPlanet({
      name: `${planet.name} copy`.slice(0, LORE_LIMITS.planetName),
      spec: planet.spec
    })
    if (created?.id) onOpen(created.id)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, [contenteditable="true"]')) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      undo()
    }
  }

  return (
    <div className={styles.maker} onKeyDown={onKeyDown}>
      <div className={styles.makerLeft}>
        <TextInput
          label="Name"
          value={work.name}
          maxLength={LORE_LIMITS.planetName}
          invalid={!name}
          hint={!name ? 'A planet needs a name.' : undefined}
          onChange={(value) => change({ ...work, name: value })}
        />

        <div className={styles.stageFrame}>
          <PlanetSvg className={styles.stagePlanet} spec={work.spec} still={still} title={name} />
          <button
            type="button"
            className={styles.stagePause}
            aria-pressed={still}
            onClick={() => setStill(!still)}
            {...tooltipTrigger(still ? 'Play the motion' : 'Pause the motion, to look closely')}
          >
            {still ? 'Play' : 'Pause'}
          </button>
        </div>

        <div className={styles.stageBar}>
          <Button
            size="sm"
            onClick={() => setSpec(shuffledAll(work.spec))}
            disabled={!layers.length}
            {...tooltipTrigger('A fresh take on every layer that is not locked')}
          >
            Shuffle all
          </Button>
          <Button
            size="sm"
            onClick={undo}
            disabled={!trail.length}
            {...tooltipTrigger('Undo (Ctrl+Z)')}
          >
            Undo
          </Button>
          <span className={styles.spacer} />
          <span
            className={styles.meter}
            data-heavy={heavy || undefined}
            {...tooltipTrigger(
              `${drawing.shapes.toLocaleString()} shapes. Past about ${HEAVY_SHAPES.toLocaleString()}, a phone may stutter as it scrolls by.`
            )}
          >
            {heavy ? 'Heavy for phones' : 'Light for phones'}
          </span>
        </div>

        {restored && dirty ? (
          <p className={styles.notice}>
            <span className={styles.noticeLabel}>Restored</span>
            Changes that were never saved. Save them, or discard to go back.
          </p>
        ) : null}

        <div className={styles.groupHead}>
          <span className={styles.sectionLabel}>
            Layers · {layers.length} of {MAX_LAYERS}
          </span>
          <Button size="sm" variant="primary" disabled={full} onClick={() => setAdding(true)}>
            Add layer
          </Button>
        </div>
        <p className={styles.footnote}>
          The top of the list is drawn on top. Pick a layer to change it, or drag it to restack.
        </p>

        {layers.length ? (
          <ol className={styles.layers} aria-label="Layers, top first">
            {topFirst.map((layer) => {
              const def = LAYER_TYPES[layer.type]
              return (
                <li
                  key={layer.id}
                  className={styles.layer}
                  data-selected={showing === layer.id || undefined}
                  data-hidden={!layer.visible || undefined}
                  tabIndex={0}
                  onClick={() => setPicked(layer.id)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setPicked(layer.id)
                    }
                  }}
                  {...drag(layer.id)}
                >
                  <span className={styles.grip} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </span>
                  <PlanetSvg className={styles.layerThumb} spec={alone(layer)} still />
                  <span className={styles.layerName}>
                    <span className={styles.layerTitle}>{layer.name || def.label}</span>
                    <span className={styles.layerType}>
                      {def.label}
                      {layer.motion.kind !== 'none' ? ` · ${MOTION_LABEL[layer.motion.kind]}` : ''}
                    </span>
                  </span>
                  <span className={styles.layerTools} onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={layer.visible ? `Hide ${def.label}` : `Show ${def.label}`}
                      data-on={!layer.visible || undefined}
                      onClick={() => setLayer(layer.id, { visible: !layer.visible })}
                      {...tooltipTrigger(layer.visible ? 'Hide' : 'Show')}
                    >
                      <Icon d={layer.visible ? ICON.shown : ICON.hidden} />
                    </button>
                    <span className={styles.layerExtra}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={layer.locked ? `Unlock ${def.label}` : `Lock ${def.label}`}
                        data-on={layer.locked || undefined}
                        onClick={() => setLayer(layer.id, { locked: !layer.locked })}
                        {...tooltipTrigger(
                          layer.locked
                            ? 'Unlock'
                            : 'Lock: keep it as it is, even through Shuffle all'
                        )}
                      >
                        <Icon d={layer.locked ? ICON.locked : ICON.open} />
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={`Duplicate ${def.label}`}
                        disabled={full}
                        onClick={() => {
                          const next = withCopy(work.spec, layer.id)
                          setSpec(next.spec)
                          if (next.id) setPicked(next.id)
                        }}
                        {...tooltipTrigger('Duplicate')}
                      >
                        <Icon d={ICON.copy} />
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={`Remove ${def.label}`}
                        disabled={layer.locked}
                        onClick={() => setSpec(without(work.spec, layer.id))}
                        {...tooltipTrigger(layer.locked ? 'Locked' : 'Remove')}
                      >
                        <Icon d={ICON.remove} />
                      </button>
                    </span>
                  </span>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className={styles.empty}>
            No layers yet: just the planet itself. Add layer to start drawing on it.
          </p>
        )}

        <button
          type="button"
          className={styles.planetEntry}
          data-selected={showing === PLANET || undefined}
          onClick={() => setPicked(PLANET)}
        >
          <span className={styles.layerTitle}>The planet itself</span>
          <span className={styles.layerType}>Surface, rim and shade, under every layer</span>
        </button>

        <div className={styles.makerFoot}>
          <p className={styles.meta}>
            <span>{savedAt ? `Saved on this PC ${formatRelative(savedAt)}` : 'Not saved yet'}</span>
            <span>
              {users.length
                ? `Drawn for ${users.map((draft) => draft.title || 'Untitled').join(', ')}`
                : 'No chapter uses it yet'}
            </span>
          </p>
          <div className={styles.actions}>
            {confirmingDelete ? (
              <>
                <span className={styles.confirmText}>Delete this planet from the library?</span>
                <Button
                  size="sm"
                  variant="danger"
                  busy={actions.pending === 'delete-planet'}
                  onClick={() =>
                    void actions.deletePlanet(planet.id).then((done) => {
                      setConfirmingDelete(false)
                      if (!done) return
                      clearBackup(backupKey)
                      onDeleted()
                    })
                  }
                >
                  Delete
                </Button>
                <Button size="sm" onClick={() => setConfirmingDelete(false)}>
                  Keep it
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  busy={actions.pending === 'create-planet'}
                  disabled={dirty}
                  onClick={() => void duplicate()}
                  {...tooltipTrigger(
                    dirty ? 'Save or discard first' : 'A copy, to try something else'
                  )}
                >
                  Duplicate
                </Button>
                <Button
                  size="sm"
                  disabled={users.length > 0}
                  onClick={() => setConfirmingDelete(true)}
                  {...tooltipTrigger(
                    users.length ? 'Give those chapters another planet first' : 'Delete it'
                  )}
                >
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className={styles.controlsColumn}>
        {pickedLayer ? (
          <LayerControls
            key={pickedLayer.id}
            layer={pickedLayer}
            onChange={(patch) => setLayer(pickedLayer.id, patch)}
            onParams={(params) => setSpec(withParams(work.spec, pickedLayer.id, params))}
            onShuffle={() =>
              setSpec({
                ...work.spec,
                layers: layers.map((layer) =>
                  layer.id === pickedLayer.id ? shuffled(layer) : layer
                )
              })
            }
          />
        ) : (
          <PlanetSettings spec={work.spec} onChange={setSpec} />
        )}
      </div>

      {adding ? (
        <AddLayerDialog
          onCancel={() => setAdding(false)}
          onAdd={(type) => {
            const next = withNewLayer(work.spec, type)
            setSpec(next.spec)
            if (next.id) setPicked(next.id)
            setAdding(false)
          }}
        />
      ) : null}
    </div>
  )
}
