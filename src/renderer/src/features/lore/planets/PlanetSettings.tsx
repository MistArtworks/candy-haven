import type { ReactNode } from 'react'
import { DASHES, SURFACE_KINDS, type PlanetSpec, type SurfaceKind } from '@shared/planets/engine'
import { Slider } from '@renderer/components/primitives/Slider'
import { ColorField, Section, Segmented, Switch } from '../components/Controls'
import { readout } from '../lib/format'
import styles from '../Lore.module.scss'

const SURFACE_LABEL: Record<SurfaceKind, string> = {
  solid: 'Solid',
  gradient: 'Gradient',
  grain: 'Grain'
}

type Surface = PlanetSpec['surface']
type Rim = PlanetSpec['rim']
type Shade = PlanetSpec['shade']

/**
 * The planet itself, under and around its layers: the surface it's painted
 * on, the rim round its edge, and the faint shade across its far side.
 * The surface is open to begin with; the rim and shade fold away.
 */
export function PlanetSettings({
  spec,
  onChange
}: {
  spec: PlanetSpec
  onChange: (spec: PlanetSpec) => void
}): ReactNode {
  const { surface, rim, shade } = spec
  const setSurface = (patch: Partial<Surface>): void =>
    onChange({ ...spec, surface: { ...surface, ...patch } })
  const setRim = (patch: Partial<Rim>): void => onChange({ ...spec, rim: { ...rim, ...patch } })
  const setShade = (patch: Partial<Shade>): void =>
    onChange({ ...spec, shade: { ...shade, ...patch } })

  return (
    <div className={styles.controlStack}>
      <div className={styles.controlsHead}>
        <div className={styles.controlsTitle}>
          <span className={styles.sectionLabel}>The planet itself</span>
          <span className={styles.footnote}>
            What every layer is drawn on: its surface, the rim round its edge, and a faint shade.
          </span>
        </div>
      </div>

      <Section
        title="Surface"
        defaultOpen
        summary={
          <>
            <span className={styles.summarySwatch} style={{ background: surface.color }} />
            {SURFACE_LABEL[surface.kind]}
          </>
        }
      >
        <Segmented
          label="Painted"
          value={surface.kind}
          options={SURFACE_KINDS.map((kind) => ({ value: kind, label: SURFACE_LABEL[kind] }))}
          onChange={(kind) => setSurface({ kind })}
        />
        <ColorField
          label={surface.kind === 'gradient' ? 'From' : 'Colour'}
          value={surface.color}
          onChange={(color) => setSurface({ color })}
        />
        {surface.kind !== 'solid' ? (
          <ColorField
            label={surface.kind === 'gradient' ? 'To' : 'Grain'}
            value={surface.color2}
            onChange={(color2) => setSurface({ color2 })}
          />
        ) : null}
        {surface.kind === 'gradient' ? (
          <Slider
            label="Direction"
            value={surface.angle}
            min={-180}
            max={180}
            step={1}
            readout={`${Math.round(surface.angle)}°`}
            onChange={(angle) => setSurface({ angle })}
          />
        ) : null}
        {surface.kind === 'grain' ? (
          <Slider
            label="Grain"
            value={surface.grain}
            min={0}
            max={1}
            step={0.01}
            readout={`${Math.round(surface.grain * 100)}%`}
            onChange={(grain) => setSurface({ grain })}
          />
        ) : null}
      </Section>

      <Section
        title="Rim"
        summary={
          rim.width > 0 && rim.opacity > 0 ? (
            <>
              <span className={styles.summarySwatch} style={{ background: rim.color }} />
              {Math.round(rim.opacity * 100)}%
            </>
          ) : (
            'None'
          )
        }
      >
        <ColorField label="Colour" value={rim.color} onChange={(color) => setRim({ color })} />
        <div className={styles.pair}>
          <Slider
            label="Strength"
            value={rim.opacity}
            min={0}
            max={1}
            step={0.01}
            readout={`${Math.round(rim.opacity * 100)}%`}
            onChange={(opacity) => setRim({ opacity })}
          />
          <Slider
            label="Width"
            value={rim.width}
            min={0}
            max={8}
            step={0.1}
            readout={readout(rim.width)}
            onChange={(width) => setRim({ width })}
          />
        </div>
        <div className={styles.pair}>
          <Switch label="Double" checked={rim.double} onChange={(double) => setRim({ double })} />
          <Segmented
            label="Line"
            value={rim.dash}
            options={DASHES.map((dash) => ({
              value: dash,
              label: dash === 'solid' ? 'Solid' : dash === 'dashed' ? 'Dashed' : 'Dotted'
            }))}
            onChange={(dash) => setRim({ dash })}
          />
        </div>
      </Section>

      <Section title="Shade" summary={`${Math.round(shade.strength * 100)}%`}>
        <ColorField label="Colour" value={shade.color} onChange={(color) => setShade({ color })} />
        <div className={styles.pair}>
          <Slider
            label="Strength"
            value={shade.strength}
            min={0}
            max={1}
            step={0.01}
            readout={`${Math.round(shade.strength * 100)}%`}
            onChange={(strength) => setShade({ strength })}
          />
          <Slider
            label="Begins"
            value={shade.start}
            min={0}
            max={1}
            step={0.01}
            readout={`${Math.round(shade.start * 100)}%`}
            onChange={(start) => setShade({ start })}
          />
        </div>
        <Slider
          label="Falls toward"
          value={shade.angle}
          min={-180}
          max={180}
          step={1}
          readout={`${Math.round(shade.angle)}°`}
          hint="0° darkens the right side, 90° the bottom."
          onChange={(angle) => setShade({ angle })}
        />
      </Section>
    </div>
  )
}
