import { useState, type ReactNode } from 'react'
import { planetUsers, type LoreState } from '@shared/domain/lore'
import { LORE_LIMITS } from '@shared/domain/lore.constants'
import { PRESETS, blankPlanet, presetById, type PlanetPreset } from '@shared/planets/engine'
import { PlanetSvg } from '@shared/planets/react'
import { Button } from '@renderer/components/primitives/Button'
import { Dialog } from '@renderer/components/primitives/Dialog'
import { TextInput } from '@renderer/components/primitives/Input'
import type { LoreActions } from '@renderer/hooks/useLore'
import { PlanetCard } from '../components/Planets'
import styles from '../Lore.module.scss'

const BLANK = 'blank'

/** A new planet: its name, and what it starts from, a bare planet or a preset. */
function NewPlanetDialog({
  busy,
  onCreate,
  onCancel
}: {
  busy: boolean
  onCreate: (name: string, from: string) => void
  onCancel: () => void
}): ReactNode {
  const [name, setName] = useState('')
  const [from, setFrom] = useState(BLANK)
  const bare = blankPlanet()
  return (
    <Dialog
      title="New planet"
      subtitle="Kept in the library on this PC. Chapters pick it from there."
      width="wide"
      confirmLabel="Make it"
      busy={busy}
      canConfirm={Boolean(name.trim())}
      onConfirm={() => onCreate(name.trim(), from)}
      onCancel={onCancel}
    >
      <div className={styles.pickGroups}>
        <TextInput
          label="Name"
          value={name}
          onChange={setName}
          placeholder="What it's called in the library"
          maxLength={LORE_LIMITS.planetName}
        />
        <section className={styles.library}>
          <span className={styles.sectionLabel}>Start from</span>
          <ul className={styles.libraryGrid}>
            <li>
              <PlanetCard
                spec={bare}
                name="Bare"
                note="No layers"
                selected={from === BLANK}
                onClick={() => setFrom(BLANK)}
              />
            </li>
            {PRESETS.map((preset) => (
              <li key={preset.id}>
                <PlanetCard
                  spec={preset.spec}
                  name={preset.name}
                  note={`${preset.spec.layers.length} layers`}
                  selected={from === preset.id}
                  onClick={() => {
                    setFrom(preset.id)
                    if (!name.trim()) setName(preset.name)
                  }}
                />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Dialog>
  )
}

/**
 * The library: the planets made here, then the presets the lore began
 * with. A preset is never changed; duplicated, it becomes a planet of the
 * library's own, to change as much as anyone likes.
 */
export function PlanetLibrary({
  state,
  selectedId,
  onSelect,
  actions
}: {
  state: LoreState
  selectedId: string | null
  onSelect: (id: string) => void
  actions: LoreActions
}): ReactNode {
  const [creating, setCreating] = useState(false)

  const create = async (name: string, from: string): Promise<void> => {
    const preset = presetById(from)
    const created = await actions.createPlanet({ name, spec: preset?.spec ?? blankPlanet() })
    if (!created) return
    setCreating(false)
    if (created.id) onSelect(created.id)
  }

  return (
    <div className={styles.libraryPanel}>
      <div className={styles.listHead}>
        <span className={styles.count}>
          {state.planets.length} planet{state.planets.length === 1 ? '' : 's'} · {PRESETS.length}{' '}
          presets
        </span>
        <span className={styles.spacer} />
        <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
          New planet
        </Button>
      </div>

      <section className={styles.library}>
        <span className={styles.sectionLabel}>Your planets</span>
        {state.planets.length ? (
          <ul className={styles.libraryGrid}>
            {state.planets.map((planet) => {
              const used = planetUsers(state, planet.id).length
              return (
                <li key={planet.id}>
                  <PlanetCard
                    spec={planet.spec}
                    name={planet.name}
                    note={used ? `Used by ${used}` : 'Not used'}
                    selected={selectedId === planet.id}
                    onClick={() => onSelect(planet.id)}
                  />
                </li>
              )
            })}
          </ul>
        ) : (
          <p className={styles.empty}>
            None yet. Make one with New planet, or duplicate a preset to start from it.
          </p>
        )}
      </section>

      <section className={styles.library}>
        <span className={styles.sectionLabel}>Presets</span>
        <ul className={styles.libraryGrid}>
          {PRESETS.map((preset) => (
            <li key={preset.id}>
              <PlanetCard
                spec={preset.spec}
                name={preset.name}
                note="Preset"
                selected={selectedId === preset.id}
                onClick={() => onSelect(preset.id)}
              />
            </li>
          ))}
        </ul>
      </section>

      {creating ? (
        <NewPlanetDialog
          busy={actions.pending === 'create-planet'}
          onCreate={(name, from) => void create(name, from)}
          onCancel={() => setCreating(false)}
        />
      ) : null}
    </div>
  )
}

/** A preset, open: as it draws, and the way to make it one's own. */
export function PresetView({
  preset,
  actions,
  onOpen
}: {
  preset: PlanetPreset
  actions: LoreActions
  onOpen: (id: string) => void
}): ReactNode {
  const duplicate = async (): Promise<void> => {
    const created = await actions.createPlanet({ name: preset.name, spec: preset.spec })
    if (created?.id) onOpen(created.id)
  }
  return (
    <div className={styles.presetView}>
      <div className={styles.stageFrame}>
        <PlanetSvg className={styles.stagePlanet} spec={preset.spec} title={preset.name} />
      </div>
      <div className={styles.presetText}>
        <span className={styles.sectionLabel}>Preset · {preset.spec.layers.length} layers</span>
        <h3 className={styles.presetName}>{preset.name}</h3>
        <p className={styles.footnote}>{preset.description}</p>
        <p className={styles.footnote}>
          Presets are the looks the lore began with, and they stay as they are. Duplicate one to
          make a planet of your own from it.
        </p>
        <div className={styles.actions}>
          <Button
            variant="primary"
            size="sm"
            busy={actions.pending === 'create-planet'}
            onClick={() => void duplicate()}
          >
            Duplicate to edit
          </Button>
        </div>
      </div>
    </div>
  )
}
