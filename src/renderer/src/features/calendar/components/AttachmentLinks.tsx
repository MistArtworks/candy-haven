import type { ReactNode } from 'react'
import { TARGET_KIND_LABEL, type Pin } from '@shared/domain/strip'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import { describeTarget } from '../attachments'
import styles from '../CalendarPage.module.scss'

export interface AttachmentLinksProps {
  pins: readonly Pin[]
  onOpen: (pin: Pin) => void
}

/**
 * An entry's attachments by name, each opened with one click.
 *
 * Only where an entry is read at length, in AGENDA and the day sheet. A chip
 * in a month cell has room for a count and no more; see `EntryHints`.
 */
export function AttachmentLinks({ pins, onOpen }: AttachmentLinksProps): ReactNode {
  if (pins.length === 0) return null

  return (
    <ul className={styles.entryPins} aria-label="Attachments">
      {pins.map((pin) => (
        <li key={pin.id}>
          <button
            type="button"
            className={styles.entryPin}
            onClick={() => onOpen(pin)}
            {...tooltipTrigger(`Open ${describeTarget(pin.target) || pin.label}`)}
          >
            <span className={styles.entryPinKind}>{TARGET_KIND_LABEL[pin.target.kind]}</span>
            <span className={styles.entryPinLabel}>{pin.label}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
