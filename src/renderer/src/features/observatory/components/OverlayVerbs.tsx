import type { ReactNode } from 'react'
import { Button } from '@renderer/components/primitives/Button'
import type { DeckAction, DeckRunner } from '../lib/deck'
import styles from './OverlayVerbs.module.scss'

export interface OverlayVerbsProps {
  actions: readonly DeckAction[]
  runner: DeckRunner
  /** Trailing slot — the way through to the overlay's own page, on the desk. */
  trailing?: ReactNode
  className?: string
}

/**
 * The things an operator does to an overlay, as a row.
 *
 * One component for this because it is now drawn in two places that must not
 * drift: the desk's bench and slot 02 of every overlay's own page. Those were
 * separate implementations — the desk built buttons from `actionsFor` while
 * each page hand-wrote its own `Put the call` / `Open the selection` /
 * `Start` — which is why the same verb reads differently depending on where you
 * pressed it.
 *
 * **A refused verb says why, in words, without being pressed.** The button is
 * disabled and carries the reason as its title, and the reason is also printed
 * beneath the row, because a disabled control with no visible cause is the
 * failure this whole department was rebuilt to remove. Every refusal here is
 * mirrored from the service that enforces it — correctness lives in the main
 * process and these are only its explanation.
 */
export function OverlayVerbs({
  actions,
  runner,
  trailing,
  className
}: OverlayVerbsProps): ReactNode {
  /*
   * Distinct refusals, not just the first.
   *
   * The old card printed `actions.find(a => a.refusal)`, so a bench offering
   * two blocked verbs for two different reasons explained one of them. Deduped
   * because several verbs commonly share a cause — a missing chat channel
   * blocks putting a call and putting a question alike.
   */
  const refusals = [
    ...new Set(
      actions.map((action) => action.refusal).filter((reason): reason is string => Boolean(reason))
    )
  ]

  if (actions.length === 0 && !trailing) return null

  /*
   * The lead verb, given its own line and its full size.
   *
   * `actionsFor` already orders every case so that the first entry is the verb
   * for the phase the overlay is in — an open call leads with Close, a stopped
   * clock leads with Start — so taking the first is taking the obvious one
   * rather than an arbitrary one.
   *
   * Emphasis is **size and position, not colour.** Forcing `primary` on the
   * lead would paint `Close the call` crimson, and crimson in this console is
   * reserved for live state and destructive actions; closing a call is neither.
   * So the lead keeps whatever variant its action declares and earns its weight
   * by standing alone at full height above the rest.
   *
   * This is also where the board's per-row buttons went. Eleven of them down
   * the sidebar was the noise; one unmistakable control here is the same
   * affordance said once.
   */
  const [lead, ...rest] = actions

  return (
    <div className={[styles.verbs, className ?? ''].filter(Boolean).join(' ')}>
      {lead ? (
        <div className={styles.leadRow}>
          <Button
            className={styles.lead}
            variant={lead.variant ?? 'ghost'}
            busy={runner.pending === lead.key}
            disabled={Boolean(lead.refusal)}
            title={lead.refusal}
            onClick={() => void runner.run(lead)}
          >
            {lead.label}
          </Button>

          {trailing ? <span className={styles.trailing}>{trailing}</span> : null}
        </div>
      ) : trailing ? (
        <div className={styles.leadRow}>
          <span className={styles.trailing}>{trailing}</span>
        </div>
      ) : null}

      {rest.length > 0 ? (
        <div className={styles.row}>
          {rest.map((action) => (
            <Button
              key={action.key}
              size="sm"
              variant={action.variant ?? 'ghost'}
              busy={runner.pending === action.key}
              disabled={Boolean(action.refusal)}
              title={action.refusal}
              onClick={() => void runner.run(action)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}

      {refusals.length > 0 ? (
        <ul className={styles.refusals}>
          {refusals.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
