import { useState, type ReactNode } from 'react'
import type { LoreState, PublishedChapter } from '@shared/domain/lore'
import { PRESETS, type PlanetSpec } from '@shared/planets/engine'
import { PlanetSvg } from '@shared/planets/react'
import { Button } from '@renderer/components/primitives/Button'
import { Dialog } from '@renderer/components/primitives/Dialog'
import { formatRelative, timeOf, whoLabel } from '../lib/format'
import styles from '../Lore.module.scss'

/** One planet in a grid: still, small, named. */
export function PlanetCard({
  spec,
  name,
  note,
  selected,
  onClick
}: {
  spec: PlanetSpec
  name: string
  note?: string
  selected: boolean
  onClick: () => void
}): ReactNode {
  return (
    <button
      type="button"
      className={styles.planetCard}
      data-selected={selected || undefined}
      aria-pressed={selected}
      onClick={onClick}
    >
      <PlanetSvg className={styles.cardPlanet} spec={spec} still />
      <span className={styles.cardName}>{name}</span>
      {note ? <span className={styles.cardNote}>{note}</span> : null}
    </button>
  )
}

/** Choosing the planet a chapter is read beside: one of the library's, or a preset. */
export function PlanetPicker({
  state,
  value,
  onPick,
  onCancel
}: {
  state: LoreState
  value: string
  onPick: (id: string) => void
  onCancel: () => void
}): ReactNode {
  const [choice, setChoice] = useState(value)
  return (
    <Dialog
      title="Choose a planet"
      subtitle="The planet the chapter is read beside, on the website."
      width="wide"
      confirmLabel="Use this planet"
      canConfirm={Boolean(choice)}
      onConfirm={() => onPick(choice)}
      onCancel={onCancel}
    >
      <div className={styles.pickGroups}>
        <section className={styles.library}>
          <span className={styles.sectionLabel}>Your planets</span>
          {state.planets.length ? (
            <ul className={styles.libraryGrid}>
              {state.planets.map((planet) => (
                <li key={planet.id}>
                  <PlanetCard
                    spec={planet.spec}
                    name={planet.name}
                    selected={choice === planet.id}
                    onClick={() => setChoice(planet.id)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>None yet. Make one in PLANETS.</p>
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
                  selected={choice === preset.id}
                  onClick={() => setChoice(preset.id)}
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
 * The other person published this chapter first, or took it down, after
 * this draft started from it.
 *
 * Asked rather than settled, because either answer can be right: theirs may
 * be the version to keep, or a slip to publish over. Cancelling keeps the
 * draft here as it is, unpublished, to compare or copy from.
 */
export function PublishConflictDialog({
  current,
  busy,
  onOverwrite,
  onTakeTheirs,
  onCancel
}: {
  /** Their version, or null when they took the chapter off the website. */
  current: PublishedChapter | null
  busy: boolean
  onOverwrite: () => void
  onTakeTheirs: () => void
  onCancel: () => void
}): ReactNode {
  const who = current ? whoLabel(current.publishedBy) || 'The other copy of the console' : ''
  const when = current ? timeOf(current.publishedAt) : 0
  return (
    <Dialog
      title={current ? 'Published elsewhere first' : 'Taken down elsewhere'}
      subtitle={
        current
          ? `${who} published this chapter${when ? ` ${formatRelative(when)}` : ''}, after your draft started from it.`
          : 'The other copy of the console took this chapter off the website after your draft started from it.'
      }
      confirmLabel={current ? 'Publish mine over theirs' : 'Publish it again'}
      danger={Boolean(current)}
      busy={busy}
      canConfirm
      onConfirm={onOverwrite}
      onCancel={onCancel}
    >
      <div className={styles.conflict}>
        {current ? (
          <>
            <p>
              Publishing yours replaces their version on the website. Taking theirs drops the draft
              here and opens their version instead. Cancel keeps your draft as it is, unpublished,
              so you can compare first.
            </p>
            <div className={styles.actions}>
              <Button size="sm" onClick={onTakeTheirs} disabled={busy}>
                Take theirs instead
              </Button>
            </div>
          </>
        ) : (
          <p>
            Publishing puts it back on the website, as your draft has it, at the end of the order.
            Cancel leaves it off; the draft stays here either way.
          </p>
        )}
      </div>
    </Dialog>
  )
}
