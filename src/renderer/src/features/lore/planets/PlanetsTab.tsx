import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import type { LoreState } from '@shared/domain/lore'
import { presetById } from '@shared/planets/engine'
import { Panel } from '@renderer/components/primitives/Panel'
import type { LoreActions } from '@renderer/hooks/useLore'
import { gridVariants } from '@renderer/motion/transitions'
import { PlanetEditor } from './PlanetEditor'
import { PlanetLibrary, PresetView } from './PlanetLibrary'
import styles from '../Lore.module.scss'

/**
 * PLANETS: the library beside the one being made. What's open is a planet
 * of the library's, or a preset to look at and duplicate.
 */
export function PlanetsTab({
  state,
  selectedId,
  onSelect,
  actions
}: {
  state: LoreState
  selectedId: string | null
  onSelect: (id: string | null) => void
  actions: LoreActions
}): ReactNode {
  const planet = state.planets.find((p) => p.id === selectedId) ?? null
  const preset = !planet && selectedId ? presetById(selectedId) : undefined

  return (
    <motion.div className={styles.grid} variants={gridVariants} initial="initial" animate="animate">
      <Panel label="Library" index="01" className={styles.librarySide}>
        <PlanetLibrary
          state={state}
          selectedId={selectedId}
          onSelect={onSelect}
          actions={actions}
        />
      </Panel>

      <Panel
        label={planet ? planet.name : preset ? preset.name : 'Nothing open'}
        index="02"
        focal={Boolean(planet)}
        className={[styles.makerMain, planet || preset ? styles.makerFirst : '']
          .filter(Boolean)
          .join(' ')}
        aside={
          planet || preset ? (
            <button type="button" className={styles.quiet} onClick={() => onSelect(null)}>
              Close
            </button>
          ) : null
        }
      >
        {planet ? (
          <PlanetEditor
            key={planet.id}
            planet={planet}
            state={state}
            actions={actions}
            onOpen={onSelect}
            onDeleted={() => onSelect(null)}
          />
        ) : preset ? (
          <PresetView key={preset.id} preset={preset} actions={actions} onOpen={onSelect} />
        ) : (
          <p className={styles.empty}>
            Pick a planet to make changes to it, or a preset to start one from. Planets are kept on
            this PC; a chapter carries a copy of its planet to the website when it is published.
          </p>
        )}
      </Panel>
    </motion.div>
  )
}
