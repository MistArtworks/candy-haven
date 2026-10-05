import { useState, type ReactNode } from 'react'
import {
  GROUP_SIZE,
  groupsOf,
  insertPins,
  normalizeAddress,
  siteNameOf,
  type Pin
} from '@shared/domain/strip'
import { savePins, useNotice, useStripSettings } from '../useStrip'
import { PopupHead } from '../StripPopupHost'
import styles from '../Strip.module.scss'

/**
 * Open a website: any address, typed or pasted (https:// is added when it's
 * left off), opened in the browser, or pinned, to the strip or into one of
 * its groups. A pinned site takes its own icon and name a moment later.
 */
export function WebsitePopup({ onClose }: { onClose: () => void }): ReactNode {
  const settings = useStripSettings()
  const groups = groupsOf(settings.pins)
  const [address, setAddress] = useState('')
  const [into, setInto] = useState<string | null>(null)
  const [notice, say] = useNotice()
  const url = normalizeAddress(address)
  const typed = address.trim().length > 0

  const open = (): void => {
    if (!url) return
    window.candy.strip.openTarget({ kind: 'link', url }).catch((cause: Error) => say(cause.message))
  }

  const pin = async (): Promise<void> => {
    if (!url) return
    const group = groups.find((one) => one.id === into) ?? null
    if (group && group.group.items.length >= GROUP_SIZE) {
      say(`${group.label} is full`)
      return
    }
    const added: Pin = {
      id: crypto.randomUUID(),
      label: siteNameOf(url),
      target: { kind: 'link', url }
    }
    await savePins(
      insertPins(
        settings.pins,
        [added],
        group
          ? { group: group.id, index: group.group.items.length }
          : { group: null, index: settings.pins.length }
      )
    )
    onClose()
  }

  return (
    <div className={styles.websitePopup}>
      <PopupHead title="Open a website" onClose={onClose} />

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Address</span>
        <input
          className={styles.input}
          value={address}
          placeholder="youtube.com"
          spellCheck={false}
          autoFocus
          onChange={(event) => setAddress(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') open()
          }}
        />
      </label>
      <p className={styles.addressLine} data-bad={(typed && !url) || undefined}>
        {!typed
          ? 'A site or a page. https:// is added if it’s left off.'
          : (url ?? 'That isn’t a web address.')}
      </p>

      {groups.length ? (
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Pin it to</span>
          <div className={styles.chips} role="group" aria-label="Pin it to">
            <button
              type="button"
              className={styles.chip}
              data-on={into === null || undefined}
              onClick={() => setInto(null)}
            >
              The strip
            </button>
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={styles.chip}
                data-on={into === group.id || undefined}
                onClick={() => setInto(group.id)}
              >
                {group.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {notice ? <p className={styles.popupNotice}>{notice}</p> : null}

      <div className={styles.popupActions}>
        <span className={styles.keys}>Enter opens · Esc</span>
        <button
          type="button"
          className={styles.textButton}
          disabled={!url}
          onClick={() => void pin()}
        >
          Pin it
        </button>
        <button type="button" className={styles.primaryButton} disabled={!url} onClick={open}>
          Open
        </button>
      </div>
    </div>
  )
}
