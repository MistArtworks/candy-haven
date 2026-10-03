import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { StripPopup } from '@shared/domain/strip'
import { useFit } from './useStrip'
import { NewProjectPopup } from './popups/NewProjectPopup'
import { TodayPopup } from './popups/TodayPopup'
import { AddPopup } from './popups/AddPopup'
import { FolderPopup } from './popups/FolderPopup'
import { PinPopup } from './popups/PinPopup'
import { ChoosePopup } from './popups/ChoosePopup'
import { MenuPopup } from './popups/MenuPopup'
import styles from './Strip.module.scss'

/**
 * The popup beside the strip. Made once and kept hidden (main/app/strip.ts);
 * told what to show, it draws it, measures itself, and main places and shows
 * it. Esc, or clicking anywhere else, puts it away.
 */
export function StripPopupHost({ scale }: { scale: number }): ReactNode {
  const [popup, setPopup] = useState<{ spec: StripPopup; turn: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(
    () =>
      window.candy.strip.onPopup((spec) =>
        setPopup((current) => ({ spec, turn: (current?.turn ?? 0) + 1 }))
      ),
    []
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') void window.candy.strip.closePopup()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Measured afresh on every opening: the same popup at the same size
  // wouldn't otherwise be measured again, and would never be shown.
  useFit(ref, scale, popup !== null, popup?.turn ?? 0)

  if (!popup) return null
  const close = (): void => void window.candy.strip.closePopup()

  return (
    <div ref={ref} className={styles.popupFrame}>
      <div className={styles.popup} key={popup.turn}>
        {popup.spec.kind === 'new-project' ? <NewProjectPopup onClose={close} /> : null}
        {popup.spec.kind === 'today' ? (
          <TodayPopup focus={popup.spec.entryId} onClose={close} />
        ) : null}
        {popup.spec.kind === 'add' ? <AddPopup onClose={close} /> : null}
        {popup.spec.kind === 'folder' ? (
          <FolderPopup root={popup.spec.path} label={popup.spec.label} onClose={close} />
        ) : null}
        {popup.spec.kind === 'pin' ? <PinPopup pinId={popup.spec.pinId} onClose={close} /> : null}
        {popup.spec.kind === 'choose' ? (
          <ChoosePopup pinId={popup.spec.pinId} onClose={close} />
        ) : null}
        {popup.spec.kind === 'menu' ? <MenuPopup onClose={close} /> : null}
      </div>
    </div>
  )
}

/** A popup's heading row: what it is, and a close. */
export function PopupHead({ title, onClose }: { title: string; onClose: () => void }): ReactNode {
  return (
    <div className={styles.popupHead}>
      <span className={styles.popupTitle}>{title}</span>
      <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
        ×
      </button>
    </div>
  )
}
