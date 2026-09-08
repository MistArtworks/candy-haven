import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Petition, RiteState } from '@shared/domain/rite'
import { MAX_PETITIONS, petitionOdds } from '@shared/domain/rite.constants'
import { Button } from '@renderer/components/primitives/Button'
import type { RiteActions } from '@renderer/hooks/useRite'
import styles from './PetitionRoster.module.scss'

export interface PetitionRosterProps {
  state: RiteState
  actions: RiteActions
}

/**
 * The pool, as the operator manages it.
 *
 * Entry is a bare field rather than a labelled form control: this is filled in
 * live while reading chat, so the whole interaction has to be type-and-Enter
 * with no pointer trip. The field keeps focus after each commit for the same
 * reason.
 *
 * The roster is locked outright while a selection runs. Freezing it is what
 * lets the ring hold its geometry for the whole animation — and an operator
 * cannot accidentally delete the entry that is about to win.
 */
export function PetitionRoster({ state, actions }: PetitionRosterProps): ReactNode {
  const [draft, setDraft] = useState('')
  const locked = state.phase === 'spinning'
  const odds = petitionOdds(state.petitions)
  const full = state.petitions.length >= MAX_PETITIONS

  const commit = (): void => {
    const label = draft.trim()
    if (label.length === 0 || locked || full) return
    setDraft('')
    void actions.addPetition({ label })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    commit()
  }

  return (
    <div className={styles.roster}>
      <div className={styles.entry}>
        <input
          type="text"
          className={styles.field}
          value={draft}
          disabled={locked || full}
          placeholder={full ? 'Ring is full' : 'File a petition'}
          aria-label="Petition label"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={locked || full || draft.trim().length === 0}
          onClick={commit}
        >
          File
        </Button>
      </div>

      {state.petitions.length === 0 ? (
        <p className={styles.empty}>
          Nothing filed. Add what the chat has suggested, then open the selection.
        </p>
      ) : (
        <ol className={styles.list}>
          <AnimatePresence initial={false}>
            {state.petitions.map((petition, index) => (
              <RosterRow
                key={petition.id}
                petition={petition}
                index={index}
                odds={odds[index]}
                locked={locked}
                highlighted={state.winner?.petitionId === petition.id}
                actions={actions}
              />
            ))}
          </AnimatePresence>
        </ol>
      )}

      {state.petitions.length > 0 ? (
        <div className={styles.footer}>
          <span className={styles.count}>
            {state.petitions.length} / {MAX_PETITIONS} filed
          </span>
          <Button
            variant="danger"
            size="sm"
            disabled={locked}
            busy={actions.pending === 'clear'}
            onClick={() => void actions.clearPetitions()}
          >
            Clear
          </Button>
        </div>
      ) : null}
    </div>
  )
}

interface RosterRowProps {
  petition: Petition
  index: number
  odds: number
  locked: boolean
  highlighted: boolean
  actions: RiteActions
}

function RosterRow({
  petition,
  index,
  odds,
  locked,
  highlighted,
  actions
}: RosterRowProps): ReactNode {
  return (
    <motion.li
      className={styles.row}
      data-winner={highlighted || undefined}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.18 }}
    >
      {/* The filed number is the anchor between this list, the ring's engraving
          and the announced result, so it leads the row. */}
      <span className={styles.index}>{String(index + 1).padStart(2, '0')}</span>

      <span className={styles.label} title={petition.label}>
        {petition.label}
      </span>

      <span className={styles.odds}>{(odds * 100).toFixed(odds < 0.1 ? 1 : 0)}%</span>

      {/*
        Entries, not a weight slider. Equal odds are the default and the common
        case; this exists so a repeated suggestion — or, later, a subscriber
        bonus — is visible as a count rather than hidden in a fraction.
      */}
      <span className={styles.entries} aria-label={`${petition.weight} entries`}>
        ×{petition.weight}
      </span>

      <button
        type="button"
        className={styles.remove}
        disabled={locked}
        aria-label={`Withdraw ${petition.label}`}
        onClick={() => void actions.removePetition(petition.id)}
      >
        ×
      </button>
    </motion.li>
  )
}
