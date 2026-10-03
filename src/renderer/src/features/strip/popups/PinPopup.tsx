import { useState, type ReactNode } from 'react'
import {
  OPENS_IN_LABEL,
  TARGET_KIND_LABEL,
  openedIn,
  opensInLabel,
  waysToOpen,
  type OpensIn
} from '@shared/domain/strip'
import { Icon } from '../icons'
import { targetGlyph } from '../glyphs'
import { savePins, useNotice, useStripSettings } from '../useStrip'
import { usePinnedArchive } from '../usePinnedArchive'
import { PopupHead } from '../StripPopupHost'
import styles from '../Strip.module.scss'

/**
 * A pin's options, from right-clicking it: rename, move, show, remove. A
 * stack or a project also lists the ways it opens, and which one a click
 * takes (or that a click asks).
 */
export function PinPopup({ pinId, onClose }: { pinId: string; onClose: () => void }): ReactNode {
  const settings = useStripSettings()
  const index = settings.pins.findIndex((pin) => pin.id === pinId)
  const pin = settings.pins[index]
  const [label, setLabel] = useState(pin?.label ?? '')
  const archive = usePinnedArchive(pin?.target ?? null)
  const [notice, say] = useNotice()

  if (!pin) return null
  const { target } = pin
  const ways = waysToOpen(target)
  const told =
    target.kind === 'stack' || target.kind === 'project' ? (target.opensIn ?? null) : null
  const where =
    archive?.where ?? ('path' in target ? target.path : 'url' in target ? target.url : null)

  const save = (pins = settings.pins): Promise<void> => savePins(pins)
  const rename = (): void => {
    const name = label.trim()
    if (!name || name === pin.label) return
    void save(
      settings.pins.map((one) => (one.id === pin.id ? { ...one, label: name.slice(0, 80) } : one))
    )
  }
  const move = (by: number): void => {
    const next = [...settings.pins]
    const [moved] = next.splice(index, 1)
    next.splice(Math.max(0, Math.min(next.length, index + by)), 0, moved)
    void save(next)
  }
  const tell = (way: OpensIn | null): void => {
    void save(
      settings.pins.map((one) =>
        one.id === pin.id ? { ...one, target: openedIn(one.target, way) } : one
      )
    )
  }

  return (
    <div className={styles.pinPopup}>
      <PopupHead title={TARGET_KIND_LABEL[target.kind]} onClose={onClose} />
      <div className={styles.pinHead}>
        <Icon glyph={targetGlyph(target)} />
        <input
          className={styles.input}
          value={label}
          maxLength={80}
          aria-label="Name"
          onChange={(event) => setLabel(event.target.value)}
          onBlur={rename}
          onKeyDown={(event) => {
            if (event.key === 'Enter') rename()
          }}
        />
      </div>
      {where ? (
        <p className={styles.where} data-gone={archive?.gone || undefined}>
          {where}
        </p>
      ) : null}
      {ways.length ? (
        <div className={styles.onClick}>
          <span className={styles.fieldLabel}>On click</span>
          <div className={styles.chips} role="group" aria-label="On click">
            <button
              type="button"
              className={styles.chip}
              data-on={told === null || undefined}
              onClick={() => tell(null)}
            >
              Ask
            </button>
            {ways.map((way) => (
              <button
                key={way}
                type="button"
                className={styles.chip}
                data-on={told === way || undefined}
                onClick={() => tell(way)}
              >
                {OPENS_IN_LABEL[way]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className={styles.menu}>
        {ways.map((way) => (
          <button
            key={way}
            type="button"
            className={styles.menuItem}
            onClick={() =>
              window.candy.strip
                .openTarget(openedIn(target, way))
                .catch((cause: Error) => say(cause.message))
            }
          >
            {opensInLabel(target, way)}
          </button>
        ))}
        {ways.length ? <span className={styles.menuRule} /> : null}
        {target.kind === 'file' || target.kind === 'folder' ? (
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              void window.candy.shell.reveal(target.path)
              onClose()
            }}
          >
            Show in Explorer
          </button>
        ) : null}
        <button
          type="button"
          className={styles.menuItem}
          disabled={index === 0}
          onClick={() => move(-1)}
        >
          Move earlier
        </button>
        <button
          type="button"
          className={styles.menuItem}
          disabled={index === settings.pins.length - 1}
          onClick={() => move(1)}
        >
          Move later
        </button>
        <button
          type="button"
          className={styles.menuItem}
          data-danger
          onClick={() => {
            void save(settings.pins.filter((one) => one.id !== pin.id))
            onClose()
          }}
        >
          Remove from the strip
        </button>
      </div>
      {notice ? <p className={styles.popupNotice}>{notice}</p> : null}
    </div>
  )
}
