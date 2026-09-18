import type { ReactNode } from 'react'
import styles from './OverlayIdentity.module.scss'

export interface OverlayIdentityProps {
  /** What kind of thing this is: `OPEN CALL`, `CHAT VOTE`. */
  role: string
  /** What it shows, in one plain sentence. */
  purpose: string
  /** Numbered plain steps. Empty draws nothing at all. */
  steps: readonly string[]
  /** Heading above the steps. */
  stepsLabel?: string
  /** Flavour from the world brief. Drawn last, faint, in quotes. */
  epigraph?: string
  className?: string
}

/**
 * What an overlay is, said in the order somebody actually needs it.
 *
 * ## What this replaced
 *
 * Each block on the old desk opened with its purpose and then its **epigraph**,
 * set in italic behind a rule — so the second thing every overlay told you was
 * a line of world-building. Eleven of those stacked down a page is a lot of
 * institutional mood in front of the two questions being asked: *what is this
 * for* and *what is it doing*.
 *
 * The epigraph is not the problem; leading with it was. It stays, and it stays
 * in the world's voice, at the bottom and faint — the console is furniture from
 * this universe and stripping the voice out would be the opposite mistake.
 *
 * ## Why steps and not a longer sentence
 *
 * A sentence can say what an overlay *is*. Only steps say how it is *used*, and
 * "how do I run this" is the question somebody has while looking at eleven
 * instruments they did not design. The steps also carry the one thing no
 * description can — **the chat command**, which is the whole interface for
 * three of these and is otherwise buried in a config field two pages away.
 *
 * Three steps is the budget. The full procedure is CATECHISM's job; a block
 * long enough to scroll would be the wall of prose this was built to remove.
 */
export function OverlayIdentity({
  role,
  purpose,
  steps,
  stepsLabel = 'How it runs',
  epigraph,
  className
}: OverlayIdentityProps): ReactNode {
  return (
    <div className={[styles.identity, className ?? ''].filter(Boolean).join(' ')}>
      <div className={styles.lead}>
        <span className={styles.role}>{role}</span>
        <p className={styles.purpose}>{purpose}</p>
      </div>

      {steps.length > 0 ? (
        <div className={styles.steps}>
          <span className={styles.stepsLabel}>{stepsLabel}</span>
          <ol className={styles.stepList}>
            {steps.map((step, position) => (
              <li key={step} className={styles.step}>
                <span className={styles.stepIndex}>{String(position + 1).padStart(2, '0')}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {epigraph ? <p className={styles.epigraph}>{epigraph}</p> : null}
    </div>
  )
}
