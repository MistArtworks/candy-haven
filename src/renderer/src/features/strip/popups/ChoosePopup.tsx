import { useState, type ReactNode } from 'react'
import {
  findPin,
  isGroup,
  openedIn,
  opensInLabel,
  updatePin,
  waysToOpen,
  type OpensIn,
  type Target
} from '@shared/domain/strip'
import { Icon } from '../icons'
import type { Glyph } from '../glyphs'
import { savePins, useNotice, useStripSettings } from '../useStrip'
import { usePinnedArchive } from '../usePinnedArchive'
import { PopupHead } from '../StripPopupHost'
import styles from '../Strip.module.scss'

const WAY_GLYPH: Record<OpensIn, Glyph> = {
  ableton: 'set',
  archive: 'archive',
  explorer: 'folder'
}

/** What each way opens, under its name. */
function wayHint(target: Target, way: OpensIn, path: string | null): string {
  if (way === 'ableton') return 'Its set, in Live'
  if (way === 'archive') {
    return target.kind === 'project' ? 'Its dossier, in the console' : 'The stack, in the console'
  }
  return path ?? 'Its folder on disk'
}

/**
 * A stack or a project pinned without being told how to open: the ways it
 * can, one click each. Ticking "Always" makes the choice the pin's own, so
 * the next click goes straight there; right-click the pin to have it ask again.
 */
export function ChoosePopup({ pinId, onClose }: { pinId: string; onClose: () => void }): ReactNode {
  const settings = useStripSettings()
  // On the strip, or in one of its groups.
  const found = findPin(settings.pins, pinId)?.pin
  const pin = found && !isGroup(found) ? found : null
  const archive = usePinnedArchive(pin?.target ?? null)
  const [always, setAlways] = useState(false)
  const [notice, say] = useNotice()

  if (!pin) return null

  const go = (way: OpensIn): void => {
    const target = openedIn(pin.target, way)
    window.candy.strip
      .openTarget(target)
      .then(() =>
        always
          ? savePins(
              updatePin(settings.pins, pin.id, (one) => (isGroup(one) ? one : { ...one, target }))
            )
          : undefined
      )
      .catch((cause: Error) => say(cause.message))
  }

  return (
    <div className={styles.choosePopup}>
      <PopupHead title={pin.label} onClose={onClose} />
      {archive ? (
        <p className={styles.where} data-gone={archive.gone || undefined}>
          {archive.where}
        </p>
      ) : null}
      <div className={styles.ways}>
        {waysToOpen(pin.target).map((way) => (
          <button key={way} type="button" className={styles.way} onClick={() => go(way)}>
            <Icon glyph={WAY_GLYPH[way]} />
            <span className={styles.wayText}>
              <span className={styles.wayLabel}>{opensInLabel(pin.target, way)}</span>
              <span className={styles.wayHint}>
                {wayHint(pin.target, way, archive?.path ?? null)}
              </span>
            </span>
          </button>
        ))}
      </div>
      {notice ? <p className={styles.popupNotice}>{notice}</p> : null}
      <label className={styles.always}>
        <input
          type="checkbox"
          checked={always}
          onChange={(event) => setAlways(event.target.checked)}
        />
        Always do this for this pin
      </label>
    </div>
  )
}
