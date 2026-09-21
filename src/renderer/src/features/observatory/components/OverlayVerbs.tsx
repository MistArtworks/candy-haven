import type { ReactNode } from 'react'
import { Button } from '@renderer/components/primitives/Button'
import type { DeckAction, DeckRunner } from '../lib/deck'
import styles from './OverlayVerbs.module.scss'

export interface OverlayVerbsProps {
  actions: readonly DeckAction[]
  runner: DeckRunner
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
export function OverlayVerbs({ actions, runner, className }: OverlayVerbsProps): ReactNode {
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

  if (actions.length === 0) return null

  /*
   * The lead verb, last on the bench and the full width of it.
   *
   * `actionsFor` already orders every case so that the first entry is the verb
   * for the phase the overlay is in — an open call leads with Close, a stopped
   * clock leads with Start — so taking the first is taking the obvious one
   * rather than an arbitrary one.
   *
   * **Last, not first.** It stood at the top of the bench above the fields it
   * commits, which is the wrong way round for the way the bench is actually
   * worked: read the kind, set the title, add the options, *then* put it on
   * air. Everything above it is composition; this is the act. The operator
   * asked for it down here, and the form it now closes is the argument for it.
   *
   * **Emphasis is size and position, not colour.** Forcing `primary` on the
   * lead would paint `Close the call` crimson, and crimson in this console is
   * reserved for live state and destructive actions; closing a call is neither.
   * So the lead keeps whatever variant its action declares and earns its weight
   * by running the whole width at a size nothing else on the bench is set at.
   *
   * This is also where the board's per-row buttons went. Eleven of them down
   * the sidebar was the noise; one unmistakable control here is the same
   * affordance said once.
   */
  const [lead, ...rest] = actions

  return (
    <div className={[styles.verbs, className ?? ''].filter(Boolean).join(' ')}>
      {lead ? (
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
      ) : null}

      {/*
        Directly under the button it explains, and above the helpers rather
        than after them: a disabled lead with its cause one row further down,
        past three other controls, is the disabled-with-no-visible-reason
        failure said quietly instead of loudly.
      */}
      {refusals.length > 0 ? (
        <ul className={styles.refusals}>
          {refusals.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      {/*
        The helpers, under the act rather than over it.

        `Restart`, `Reset`, `+1 min`, `Clear the roll` — everything that is not
        the verb for the phase the overlay is in. They sat above the lead as a
        left-packed strip of small buttons, which put `Reset` in the path of a
        cursor travelling to `Start` and made the row read as the primary
        controls with a large button underneath rather than the reverse.

        Laid out as one centred group of equal widths, so a bench with two of
        them and a bench with four both read as a tier of the same object
        instead of a row that happens to be that long.
      */}
      {rest.length > 0 ? (
        <div className={styles.helpers}>
          {rest.map((action) => (
            <Button
              key={action.key}
              className={styles.helper}
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
    </div>
  )
}
