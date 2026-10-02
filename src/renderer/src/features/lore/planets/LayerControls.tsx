import { useState, type ReactNode } from 'react'
import {
  BLENDS,
  DASHES,
  LAYER_GROUPS,
  MOTION_KINDS,
  MOTION_LABEL,
  evenList,
  layerTypeDef,
  type Blend,
  type Dash,
  type Layer,
  type LayerParams,
  type MotionKind,
  type ParamDef
} from '@shared/planets/engine'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import { Slider } from '@renderer/components/primitives/Slider'
import { ColorField, Section, Segmented, Switch } from '../components/Controls'
import { readout } from '../lib/format'
import styles from '../Lore.module.scss'

const DASH_LABEL: Record<Dash, string> = { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted' }

const BLEND_LABEL: Record<Blend, string> = {
  normal: 'Normal',
  screen: 'Screen',
  multiply: 'Multiply',
  overlay: 'Overlay',
  lighten: 'Lighten',
  darken: 'Darken',
  difference: 'Difference'
}

/** How many shape settings show before "More shape settings". */
const MAIN_SHAPE_SETTINGS = 3

/** One shape control of a layer type, drawn from its definition. */
function ParamControl({
  def,
  value,
  disabled,
  onChange
}: {
  def: ParamDef
  value: LayerParams[string] | undefined
  disabled: boolean
  onChange: (value: LayerParams[string]) => void
}): ReactNode {
  switch (def.kind) {
    case 'number': {
      const current = typeof value === 'number' ? value : def.default
      return (
        <Slider
          label={def.label}
          value={current}
          min={def.min}
          max={def.max}
          step={def.step}
          readout={readout(current)}
          hint={def.hint}
          disabled={disabled}
          onChange={onChange}
        />
      )
    }
    case 'int': {
      const current = typeof value === 'number' ? value : def.default
      return (
        <Slider
          label={def.label}
          value={current}
          min={def.min}
          max={def.max}
          step={1}
          readout={readout(current)}
          hint={def.hint}
          disabled={disabled}
          onChange={(next) => onChange(Math.round(next))}
        />
      )
    }
    case 'boolean':
      return (
        <Switch
          label={def.label}
          checked={typeof value === 'boolean' ? value : def.default}
          disabled={disabled}
          onChange={onChange}
        />
      )
    case 'choice':
      return (
        <Segmented
          label={def.label}
          value={typeof value === 'string' ? value : def.default}
          options={def.options}
          disabled={disabled}
          onChange={onChange}
        />
      )
    case 'list': {
      // Set by a count, spread evenly: a preset's hand-placed positions stay
      // until the count is moved.
      const count = Array.isArray(value) ? value.length : def.default.length
      return (
        <Slider
          label={def.label}
          value={count}
          min={0}
          max={def.maxItems}
          step={1}
          readout={readout(count)}
          hint={def.hint ?? 'Spread evenly.'}
          disabled={disabled}
          onChange={(next) => onChange(evenList(def, next))}
        />
      )
    }
  }
}

function placeSummary(layer: Layer): string {
  const parts: string[] = []
  if (layer.x || layer.y) parts.push('Moved')
  if (layer.scale !== 1) parts.push(`${readout(layer.scale)}×`)
  if (layer.rotation) parts.push(`${Math.round(layer.rotation)}°`)
  return parts.length ? parts.join(' · ') : 'Centred'
}

/**
 * Everything about one layer, folded into sections so only what's being
 * changed is open: its colour and its shape to begin with; where it sits,
 * how it moves, and its line and blending when asked for. Its shape
 * controls come from its type's definition, so a control added to the
 * engine shows up here by itself. A locked layer shows all of it and
 * changes none of it.
 */
export function LayerControls({
  layer,
  onChange,
  onParams,
  onShuffle
}: {
  layer: Layer
  onChange: (patch: Partial<Layer>) => void
  onParams: (params: LayerParams) => void
  onShuffle: () => void
}): ReactNode {
  const def = layerTypeDef(layer.type)
  const group = LAYER_GROUPS.find((g) => g.id === def.group)?.label ?? ''
  const off = layer.locked
  const params = Object.entries(def.params) as Array<[string, ParamDef]>
  const [allShape, setAllShape] = useState(false)
  const shown = allShape ? params : params.slice(0, MAIN_SHAPE_SETTINGS)
  const hasLine = Boolean(def.uses.width || def.uses.dash || def.uses.filled)

  const lineSummary = [
    def.uses.width ? `Width ${readout(layer.width)}` : null,
    def.uses.dash ? DASH_LABEL[layer.dash] : null,
    layer.blend !== 'normal' ? BLEND_LABEL[layer.blend] : null
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className={styles.controlStack}>
      <div className={styles.controlsHead}>
        <div className={styles.controlsTitle}>
          <span className={styles.sectionLabel}>
            Layer · {def.label} · {group}
          </span>
          <span className={styles.footnote}>{def.description}</span>
        </div>
        <Button size="sm" onClick={onShuffle} disabled={off}>
          Shuffle
        </Button>
      </div>

      {off ? (
        <p className={styles.notice}>
          <span className={styles.noticeLabel}>Locked</span>
          Shuffle all leaves it alone, and its settings stay as they are. Unlock it with the lock in
          the list.
        </p>
      ) : null}

      <TextInput
        label="Name"
        value={layer.name}
        placeholder={def.label}
        maxLength={60}
        disabled={off}
        onChange={(name) => onChange({ name })}
      />

      <Section
        title="Colour"
        defaultOpen
        summary={
          <>
            <span className={styles.summarySwatch} style={{ background: layer.color }} />
            {Math.round(layer.opacity * 100)}%
          </>
        }
      >
        <ColorField
          label={def.colors.color}
          value={layer.color}
          disabled={off}
          onChange={(color) => onChange({ color })}
        />
        {def.colors.color2 ? (
          <ColorField
            label={def.colors.color2}
            value={layer.color2}
            disabled={off}
            onChange={(color2) => onChange({ color2 })}
          />
        ) : null}
        <Slider
          label="Strength"
          value={layer.opacity}
          min={0}
          max={1}
          step={0.01}
          readout={`${Math.round(layer.opacity * 100)}%`}
          hint="How strongly it shows: lower lets what's under it through."
          disabled={off}
          onChange={(opacity) => onChange({ opacity })}
        />
      </Section>

      {params.length ? (
        <Section
          title="Shape"
          defaultOpen
          summary={`${params.length} setting${params.length === 1 ? '' : 's'}`}
        >
          {shown.map(([key, paramDef]) => (
            <ParamControl
              key={key}
              def={paramDef}
              value={layer.params[key]}
              disabled={off}
              onChange={(value) => onParams({ [key]: value })}
            />
          ))}
          {params.length > MAIN_SHAPE_SETTINGS ? (
            <button
              type="button"
              className={styles.moreButton}
              onClick={() => setAllShape(!allShape)}
            >
              {allShape
                ? 'Fewer shape settings'
                : `More shape settings (${params.length - MAIN_SHAPE_SETTINGS})`}
            </button>
          ) : null}
        </Section>
      ) : null}

      <Section
        title="Movement"
        summary={
          layer.motion.kind === 'none'
            ? 'Still'
            : `${MOTION_LABEL[layer.motion.kind]} · ${Math.round(layer.motion.seconds)}s`
        }
      >
        <Segmented
          label="Moves"
          value={layer.motion.kind}
          options={MOTION_KINDS.map((kind) => ({ value: kind, label: MOTION_LABEL[kind] }))}
          disabled={off}
          onChange={(kind: MotionKind) => onChange({ motion: { ...layer.motion, kind } })}
        />
        {layer.motion.kind !== 'none' ? (
          <>
            <Slider
              label="One turn takes"
              value={layer.motion.seconds}
              min={1}
              max={240}
              step={1}
              readout={`${Math.round(layer.motion.seconds)}s`}
              hint="Longer is calmer. The website holds it still for visitors who ask for less motion."
              disabled={off}
              onChange={(seconds) => onChange({ motion: { ...layer.motion, seconds } })}
            />
            {layer.motion.kind === 'spin' || layer.motion.kind === 'drift' ? (
              <Switch
                label="The other way"
                checked={layer.motion.reverse}
                disabled={off}
                onChange={(reverse) => onChange({ motion: { ...layer.motion, reverse } })}
              />
            ) : null}
          </>
        ) : null}
      </Section>

      <Section title="Position and size" summary={placeSummary(layer)}>
        <div className={styles.pair}>
          <Slider
            label="Left and right"
            value={layer.x}
            min={-1.5}
            max={1.5}
            step={0.01}
            readout={readout(layer.x)}
            disabled={off}
            onChange={(x) => onChange({ x })}
          />
          <Slider
            label="Up and down"
            value={layer.y}
            min={-1.5}
            max={1.5}
            step={0.01}
            readout={readout(layer.y)}
            disabled={off}
            onChange={(y) => onChange({ y })}
          />
          <Slider
            label="Size"
            value={layer.scale}
            min={0.1}
            max={3}
            step={0.01}
            readout={`${readout(layer.scale)}×`}
            disabled={off}
            onChange={(scale) => onChange({ scale })}
          />
          <Slider
            label="Turn"
            value={layer.rotation}
            min={-180}
            max={180}
            step={1}
            readout={`${Math.round(layer.rotation)}°`}
            disabled={off}
            onChange={(rotation) => onChange({ rotation })}
          />
        </div>
        {placeSummary(layer) !== 'Centred' ? (
          <button
            type="button"
            className={styles.moreButton}
            disabled={off}
            onClick={() => onChange({ x: 0, y: 0, scale: 1, rotation: 0 })}
          >
            Put it back in the middle
          </button>
        ) : null}
      </Section>

      <Section title={hasLine ? 'Line and blend' : 'Blend'} summary={lineSummary || 'Normal'}>
        {def.uses.width ? (
          <Slider
            label={def.uses.width}
            value={layer.width}
            min={0.1}
            max={12}
            step={0.1}
            readout={readout(layer.width)}
            disabled={off}
            onChange={(width) => onChange({ width })}
          />
        ) : null}
        {def.uses.filled || def.uses.dash ? (
          <div className={styles.pair}>
            {def.uses.filled ? (
              <Switch
                label="Filled in"
                checked={layer.filled}
                disabled={off}
                onChange={(filled) => onChange({ filled })}
              />
            ) : null}
            {def.uses.dash ? (
              <Segmented
                label="Line"
                value={layer.dash}
                options={DASHES.map((dash) => ({ value: dash, label: DASH_LABEL[dash] }))}
                disabled={off}
                onChange={(dash) => onChange({ dash })}
              />
            ) : null}
          </div>
        ) : null}
        <Segmented
          label="Blend with what's under it"
          value={layer.blend}
          options={BLENDS.map((blend) => ({ value: blend, label: BLEND_LABEL[blend] }))}
          disabled={off}
          onChange={(blend) => onChange({ blend })}
        />
      </Section>
    </div>
  )
}
