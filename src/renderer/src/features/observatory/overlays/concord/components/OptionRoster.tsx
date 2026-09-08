import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { ConcordOption, ConcordState } from '@shared/domain/concord'
import {
  MAX_OPTIONS,
  leadingOptions,
  optionShare,
  totalTally
} from '@shared/domain/concord.constants'
import { Button } from '@renderer/components/primitives/Button'
import type { ConcordActions } from '@renderer/hooks/useConcord'
import styles from './OptionRoster.module.scss'

export interface OptionRosterProps {
  state: ConcordState
  actions: ConcordActions
}

/**
 * The ballot, as the operator manages it.
 *
 * Entry is a bare field rather than a labelled form control: this gets filled in
 * live while reading chat, so the whole interaction has to be type-and-Enter
 * with no pointer trip. The field keeps focus after each commit for the same
 * reason.
 *
 * Pasting several lines at once files them all. That is not a nicety — a ballot
 * arrives as a list far more often than as four separate thoughts, and adding
 * them one at a time would publish four intermediate ballots to the broadcast.
 *
 * The ballot is locked outright once voting opens. Freezing it is what lets a
 * counted vote keep meaning what it meant: votes hold an option id, and an
 * operator cannot delete the option that is about to carry.
 */
export function OptionRoster({ state, actions }: OptionRosterProps): ReactNode {
  const [draft, setDraft] = useState('')
  const locked = state.phase === 'open' || state.phase === 'casting'
  const full = state.options.length >= MAX_OPTIONS
  const total = totalTally(state.options)
  const leading = leadingOptions(state.options)
  const leadingSet = new Set(leading.tally > 0 ? leading.ids : [])

  const commit = (): void => {
    const value = draft.trim()
    if (value.length === 0 || locked) return

    // A multi-line paste is a whole ballot. Sent as one call so the broadcast
    // sees one new ballot rather than several partial ones.
    const lines = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    setDraft('')
    if (lines.length > 1) {
      void actions.setBallot([...state.options.map((option) => option.label), ...lines])
      return
    }
    if (full) return
    void actions.addOption(lines[0] ?? value)
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
          placeholder={full ? 'Ballot is full' : 'File an option'}
          aria-label="Option label"
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

      {state.options.length === 0 ? (
        <p className={styles.empty}>
          Nothing on the ballot. File at least two options — paste a list to file several at once —
          then put the question to the chamber.
        </p>
      ) : (
        <ol className={styles.list}>
          <AnimatePresence initial={false}>
            {state.options.map((option) => (
              <RosterRow
                key={option.id}
                option={option}
                share={optionShare(option.tally, total)}
                locked={locked}
                leading={leadingSet.has(option.id)}
                carried={state.result?.optionId === option.id}
                actions={actions}
              />
            ))}
          </AnimatePresence>
        </ol>
      )}

      {state.options.length > 0 ? (
        <div className={styles.footer}>
          <span className={styles.count}>
            {state.options.length} / {MAX_OPTIONS} on the ballot
          </span>
          <Button
            variant="danger"
            size="sm"
            disabled={locked}
            busy={actions.pending === 'clear'}
            onClick={() => void actions.clearBallot()}
          >
            Clear
          </Button>
        </div>
      ) : null}
    </div>
  )
}

interface RosterRowProps {
  option: ConcordOption
  share: number
  locked: boolean
  leading: boolean
  carried: boolean
  actions: ConcordActions
}

function RosterRow({
  option,
  share,
  locked,
  leading,
  carried,
  actions
}: RosterRowProps): ReactNode {
  return (
    <motion.li
      className={styles.row}
      data-leading={leading || undefined}
      data-carried={carried || undefined}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.18 }}
    >
      {/*
        The token is the anchor between this list, the overlay's plate and what a
        viewer types in chat, so it leads the row — and it is printed exactly as
        chat must type it, not padded to the house two-digit style.
      */}
      <span className={styles.token}>{option.token}</span>

      <span className={styles.label} title={option.label}>
        {option.label}
      </span>

      {/*
        The bar is duplicated from the overlay deliberately. The operator watches
        this list while talking, not the preview, so the shape of the vote has to
        be readable here too.
      */}
      <span className={styles.bar} aria-hidden="true">
        <span className={styles.barFill} style={{ transform: `scaleX(${share})` }} />
      </span>

      <span className={styles.tally}>{option.tally}</span>
      <span className={styles.share}>{Math.round(share * 100)}%</span>

      <button
        type="button"
        className={styles.remove}
        disabled={locked}
        aria-label={`Strike ${option.label} from the ballot`}
        onClick={() => void actions.removeOption(option.id)}
      >
        ×
      </button>
    </motion.li>
  )
}
