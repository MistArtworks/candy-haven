import { toast as sonner } from 'sonner'
import styles from './Toaster.module.scss'

/*
 * Transient notices, in three tones.
 *
 * The vocabulary is not new. `useDeckRunner` in the observatory already held a
 * report apart from an error so that "one can be crimson and the other not",
 * and every other department hand-rolled the error half of the same idea into
 * its own banner. This is that distinction, stated once, for the whole console.
 *
 * | Tone      | Mark     | Lasts | Says                                      |
 * | --------- | -------- | ----- | ----------------------------------------- |
 * | `done`    | gold-300 | 4s    | it happened, there is nothing to read     |
 * | `report`  | gold-500 | 10s   | it happened and carries something to read |
 * | `refuse`  | crimson  | held  | it did not happen                         |
 *
 * **A refusal never times out**, and that is load-bearing rather than a
 * preference. Three separate places in this codebase had already written down
 * that their notices must be "held until dismissed rather than timed out" —
 * `overlays/_page.scss`, `ObservatoryPage.module.scss`, and the comment in
 * `RegulationPage` arguing against a toast at all. A refusal is the operator
 * being told their instruction was not carried out; it waits for them.
 *
 * Crimson appears on the refusal mark and nowhere else here. A toast is not a
 * focal object, so `done` and `report` are gold on obsidian.
 */

/** The shape every refusal crosses the IPC boundary in. */
type Refusal = Error & { hint?: string | null }

export interface NoticeOptions {
  /** The sentence under the label. Sentence case; the label is uppercased. */
  detail?: string | null
  /**
   * A stable identity for this notice.
   *
   * A repeat replaces the toast already on screen instead of stacking a second
   * copy of it. `ProjectDossier` used to do this by remembering the message
   * text and suppressing a match, which is the same idea with worse ergonomics
   * — the operator could not raise the notice again once it was dismissed.
   */
  id?: string
  /** One verb, at the trailing edge. Undo, reveal, go there. */
  action?: { label: string; onClick: () => void }
}

function raise(
  tone: string,
  duration: number,
  label: string,
  options: NoticeOptions = {}
): string | number {
  return sonner(label, {
    className: tone,
    duration,
    description: options.detail ?? undefined,
    id: options.id,
    action: options.action
  })
}

/** Reads a refusal from main, where every rule in this application lives. */
function sentence(cause: unknown): string {
  if (typeof cause === 'string') return cause
  const failure = cause as Refusal
  if (!failure?.message) return 'The archive refused that, and did not say why.'
  return failure.hint ? `${failure.message} ${failure.hint}` : failure.message
}

export const notify = {
  /** It happened. Nothing to read, so it leaves on its own. */
  done(label: string, options?: NoticeOptions): string | number {
    return raise(styles.done, 4000, label, options)
  },

  /**
   * It happened, and it carries something worth reading.
   *
   * A hand-off that dropped thirty entries, a release that moved three
   * projects in another department, a bulk move that renamed two folders.
   * Longer than `done` because there is a sentence to get through, and gold
   * rather than crimson because none of it is a fault.
   */
  report(label: string, options?: NoticeOptions): string | number {
    return raise(styles.report, 10000, label, options)
  },

  /**
   * It did not happen.
   *
   * Takes the refusal itself rather than a string, so the `message` + `hint`
   * unwrapping that six separate `report` helpers each wrote out by hand
   * happens in exactly one place.
   */
  refuse(cause: unknown, options: NoticeOptions & { label?: string } = {}): string | number {
    const { label = 'Refused', ...rest } = options
    return sonner(label, {
      className: styles.refusal,
      // Held. See the note at the top of this file.
      duration: Number.POSITIVE_INFINITY,
      closeButton: true,
      description: rest.detail ?? sentence(cause),
      id: rest.id,
      action: rest.action
    })
  },

  /** Takes a notice off screen early — for a refusal a later success answers. */
  dismiss(id?: string | number): void {
    sonner.dismiss(id)
  }
}
