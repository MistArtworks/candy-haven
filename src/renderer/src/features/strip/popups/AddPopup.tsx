import { useState, type DragEvent, type ReactNode } from 'react'
import type { CalendarKind } from '@shared/domain/calendar'
import { CALENDAR_KINDS, CALENDAR_KIND } from '@shared/domain/calendar.constants'
import { baseName, type Pin } from '@shared/domain/strip'
import { Icon } from '../icons'
import { targetGlyph } from '../glyphs'
import { shiftDays, useNowMinute, useNotice } from '../useStrip'
import { PopupHead } from '../StripPopupHost'
import styles from '../Strip.module.scss'

/**
 * Quick add, from the strip: a title, a kind, a time (or the whole day),
 * and what it's about, attached by dropping files or folders on it or
 * picking them. Today by default; tomorrow is one press.
 */
export function AddPopup({ onClose }: { onClose: () => void }): ReactNode {
  const { today } = useNowMinute()
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<CalendarKind>('session')
  const [time, setTime] = useState('')
  const [tomorrow, setTomorrow] = useState(false)
  const [attachments, setAttachments] = useState<Pin[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, say] = useNotice()

  const attach = async (path: string): Promise<void> => {
    const what = await window.candy.strip.inspect(path)
    if (!what) return
    setAttachments((current) => [
      ...current,
      { id: crypto.randomUUID(), label: baseName(path), target: { kind: what, path } }
    ])
  }

  const drop = async (event: DragEvent<HTMLElement>): Promise<void> => {
    event.preventDefault()
    for (const file of Array.from(event.dataTransfer.files)) {
      const path = window.candy.strip.pathOf(file)
      if (path) await attach(path)
    }
  }

  const pick = async (what: 'file' | 'folder'): Promise<void> => {
    const path = await window.candy.strip.pick(what)
    if (path) await attach(path)
  }

  const minute = /^\d{1,2}:\d{2}$/.test(time)
    ? Number(time.split(':')[0]) * 60 + Number(time.split(':')[1])
    : null
  const canAdd =
    title.trim().length > 0 && !busy && (time === '' || (minute !== null && minute < 1440))

  const add = async (): Promise<void> => {
    if (!canAdd) return
    setBusy(true)
    try {
      const date = tomorrow ? shiftDays(today, 1) : today
      await window.candy.calendar.create({
        title: title.trim(),
        kind,
        date,
        startMinute: minute,
        durationMinutes: 60,
        notes: '',
        attachments,
        checklist: []
      })
      void window.candy.strip.popup({ kind: 'today', entryId: null })
    } catch (cause) {
      say(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={styles.addPopup}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault()
      }}
      onDrop={(event) => void drop(event)}
    >
      <PopupHead title="Add to the calendar" onClose={onClose} />

      <label className={styles.field}>
        <span className={styles.fieldLabel}>What</span>
        <input
          className={styles.input}
          value={title}
          maxLength={160}
          placeholder="Mix session · Gold Seam"
          autoFocus
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void add()
          }}
        />
      </label>

      <div className={styles.chips} role="group" aria-label="Kind">
        {CALENDAR_KINDS.map((option) => (
          <button
            key={option}
            type="button"
            className={styles.chip}
            data-on={kind === option || undefined}
            title={CALENDAR_KIND[option].purpose}
            onClick={() => setKind(option)}
          >
            {CALENDAR_KIND[option].label}
          </button>
        ))}
      </div>

      <div className={styles.whenRow}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Time</span>
          <input
            className={styles.input}
            value={time}
            placeholder="All day"
            inputMode="numeric"
            onChange={(event) => setTime(event.target.value.replace(/[^\d:]/g, '').slice(0, 5))}
          />
        </label>
        <div className={styles.chips} role="group" aria-label="Day">
          <button
            type="button"
            className={styles.chip}
            data-on={!tomorrow || undefined}
            onClick={() => setTomorrow(false)}
          >
            TODAY
          </button>
          <button
            type="button"
            className={styles.chip}
            data-on={tomorrow || undefined}
            onClick={() => setTomorrow(true)}
          >
            TOMORROW
          </button>
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Attached</span>
        {attachments.length ? (
          <div className={styles.attachments}>
            {attachments.map((pin) => (
              <span key={pin.id} className={styles.attachment}>
                <Icon glyph={targetGlyph(pin.target)} size={15} />
                <span>{pin.label}</span>
                <button
                  type="button"
                  className={styles.unattach}
                  aria-label={`Remove ${pin.label}`}
                  onClick={() =>
                    setAttachments((current) => current.filter((one) => one.id !== pin.id))
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className={styles.quiet}>Drop a project, file or folder here, or choose one.</p>
        )}
        <div className={styles.pickRow}>
          <button type="button" className={styles.textButton} onClick={() => void pick('file')}>
            File…
          </button>
          <button type="button" className={styles.textButton} onClick={() => void pick('folder')}>
            Folder…
          </button>
        </div>
      </div>

      {notice ? <p className={styles.popupNotice}>{notice}</p> : null}

      <div className={styles.popupActions}>
        <span className={styles.keys}>Enter · Esc</span>
        <button type="button" className={styles.textButton} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!canAdd}
          onClick={() => void add()}
        >
          Add
        </button>
      </div>
    </div>
  )
}
