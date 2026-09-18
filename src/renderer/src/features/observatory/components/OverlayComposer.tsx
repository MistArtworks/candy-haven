import { useState, type ReactNode } from 'react'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import { useEchoedText } from '@renderer/hooks/useEchoedText'
import type { ComposerEntry, ComposerSpec, ComposerText, DeckRunner } from '../lib/deck'
import styles from './OverlayComposer.module.scss'

export interface OverlayComposerProps extends ComposerSpec {
  runner: DeckRunner
}

/**
 * What an overlay is put *with* — its title, its question, and one more of
 * whatever it is filling up with.
 *
 * The verbs on the deck were decorative without this. "Put the call" opens a
 * call asking whatever was last configured somewhere else, which is not a
 * thing anybody presses during a broadcast; "Put the question" stayed disabled
 * until you left for the overlay's own page to build a ballot, which is the
 * navigation this whole page exists to remove.
 *
 * What is deliberately *not* here is the list: reordering a ballot, weighting
 * a petition, cutting an entry from a roll. Those are composition and they
 * have a page. This is the one-line "add one more" that unblocks the verb.
 */
export function OverlayComposer({ texts, entry, filed, runner }: OverlayComposerProps): ReactNode {
  return (
    <div className={styles.composer}>
      <div className={styles.fields}>
        {texts.map((text) => (
          <EchoField key={text.key} field={text} />
        ))}
      </div>

      {entry ? <EntryField entry={entry} runner={runner} /> : null}

      {filed && filed.length > 0 ? <Filed labels={filed} /> : null}
    </div>
  )
}

/**
 * One config field, owned while it is being typed into.
 *
 * Its own component rather than a `useEchoedText` call in a loop: the number
 * of fields varies by overlay, and a hook inside a map is a hook count that
 * changes with the data.
 */
function EchoField({ field }: { field: ComposerText }): ReactNode {
  const [draft, setDraft] = useEchoedText(field.value, field.commit)

  return (
    <TextInput
      label={field.label}
      value={draft}
      onChange={setDraft}
      placeholder={field.placeholder}
      maxLength={field.maxLength}
    />
  )
}

/**
 * The add-one line.
 *
 * Commits on Enter as well as on the button, because filing three options is
 * three lines of typing and reaching for a button between each is the thing
 * that makes an operator go back to the overlay's page instead.
 *
 * The draft is cleared only once the write has been *accepted* — the services
 * refuse duplicates, over-long labels and full rosters, and clearing on send
 * would throw away what the operator typed at the moment they need to correct
 * it.
 */
function EntryField({ entry, runner }: { entry: ComposerEntry; runner: DeckRunner }): ReactNode {
  const [draft, setDraft] = useState('')
  const text = draft.trim()
  const busy = runner.pending === entry.actionKey

  const submit = (): void => {
    if (!text || entry.refusal) return

    void runner
      .run({ key: entry.actionKey, label: entry.label, run: () => entry.submit(text) })
      .then((accepted) => {
        if (accepted) setDraft('')
      })
  }

  return (
    <div className={styles.entry}>
      <TextInput
        label={entry.label}
        value={draft}
        onChange={setDraft}
        placeholder={entry.placeholder}
        hint={entry.refusal ?? entry.hint}
        maxLength={entry.maxLength}
        disabled={Boolean(entry.refusal)}
        onEnter={submit}
        className={styles.entryInput}
      />
      <Button
        size="sm"
        variant="ghost"
        busy={busy}
        disabled={!text || Boolean(entry.refusal)}
        onClick={submit}
      >
        {entry.label}
      </Button>
    </div>
  )
}

/**
 * What is already filed, as chips.
 *
 * Bounded, and the overflow is counted rather than scrolled: the point is to
 * confirm that what was typed landed and to show roughly how full the thing
 * is. Reading all forty-eight petitions is what the overlay's own roster is
 * for.
 */
const CHIP_LIMIT = 8

function Filed({ labels }: { labels: readonly string[] }): ReactNode {
  const shown = labels.slice(0, CHIP_LIMIT)
  const hidden = labels.length - shown.length

  return (
    <ul className={styles.filed}>
      {shown.map((label, index) => (
        <li key={`${label}:${index}`} className={styles.chip}>
          <span className={styles.chipIndex}>{String(index + 1).padStart(2, '0')}</span>
          <span className={styles.chipLabel}>{label}</span>
        </li>
      ))}
      {hidden > 0 ? <li className={styles.more}>+{hidden} more</li> : null}
    </ul>
  )
}
