import { useMemo, useState, type ReactNode } from 'react'
import {
  LAYER_GROUPS,
  LAYER_TYPES,
  LAYER_TYPE_IDS,
  blankPlanet,
  newLayer,
  type LayerType,
  type PlanetSpec
} from '@shared/planets/engine'
import { PlanetSvg } from '@shared/planets/react'
import { Dialog } from '@renderer/components/primitives/Dialog'
import styles from '../Lore.module.scss'

/** Each type alone on a bare planet, made once: the dialog's thumbnails. */
function useSamples(): Record<LayerType, PlanetSpec> {
  return useMemo(() => {
    const bare = blankPlanet()
    return Object.fromEntries(
      LAYER_TYPE_IDS.map((type) => [type, { ...bare, layers: [newLayer(type, 7)] }])
    ) as Record<LayerType, PlanetSpec>
  }, [])
}

/**
 * Choosing a layer to add, by group, each drawn alone on a bare planet so
 * it can be recognised before it's added. A double-click adds at once.
 */
export function AddLayerDialog({
  onAdd,
  onCancel
}: {
  onAdd: (type: LayerType) => void
  onCancel: () => void
}): ReactNode {
  const samples = useSamples()
  const [choice, setChoice] = useState<LayerType | null>(null)

  return (
    <Dialog
      title="Add a layer"
      subtitle="It goes on top. Any kind can be added more than once."
      width="wide"
      confirmLabel="Add layer"
      canConfirm={choice !== null}
      onConfirm={() => choice && onAdd(choice)}
      onCancel={onCancel}
    >
      <div className={styles.addGroups}>
        {LAYER_GROUPS.map((group) => (
          <section key={group.id} className={styles.library}>
            <span className={styles.sectionLabel}>{group.label}</span>
            <div className={styles.addGrid}>
              {LAYER_TYPE_IDS.filter((type) => LAYER_TYPES[type].group === group.id).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={styles.addCard}
                  data-selected={choice === type || undefined}
                  aria-pressed={choice === type}
                  onClick={() => setChoice(type)}
                  onDoubleClick={() => onAdd(type)}
                >
                  <PlanetSvg className={styles.addPlanet} spec={samples[type]} still />
                  <span className={styles.addLabel}>{LAYER_TYPES[type].label}</span>
                  <span className={styles.addHint}>{LAYER_TYPES[type].description}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
