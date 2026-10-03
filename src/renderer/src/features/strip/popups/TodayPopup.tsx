import { useState, type ReactNode } from 'react'
import type { CalendarEntry, CalendarPatch } from '@shared/domain/calendar'
import { CALENDAR_KIND } from '@shared/domain/calendar.constants'
import type { Pin } from '@shared/domain/strip'
import { Icon } from '../icons'
import { targetGlyph } from '../glyphs'
import { clock, shiftDays, useNowMinute, useNotice, useToday } from '../useStrip'
import { PopupHead } from '../StripPopupHost'
import styles from '../Strip.module.scss'

/**
 * Today, opened from the strip or from a reminder: what's overdue, today's
 * entries in order, and what's out or turns a year today. An entry opens in
 * place to show its notes, its checklist and its attachments, each one click
 * from opening; it can be ticked off, or moved later or to tomorrow, without
 * the console.
 */
export function TodayPopup({
  focus,
  onClose
}: {
  focus: string | null
  onClose: () => void
}): ReactNode {
  const today = useToday()
  const [open, setOpen] = useState<string | null>(focus ?? today.next?.id ?? null)
  const [notice, say] = useNotice()

  const patch = (id: string, change: CalendarPatch): void => {
    window.candy.calendar.patch(id, change).catch((cause: Error) => say(cause.message))
  }

  return (
    <div className={styles.todayPopup}>
      <PopupHead title="Today" onClose={onClose} />
      <div className={styles.todayList}>
        {today.overdue.length ? (
          <section className={styles.group}>
            <span className={styles.groupLabel} data-tone="late">
              Overdue
            </span>
            {today.overdue.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                late
                open={open === entry.id}
                onToggle={() => setOpen(open === entry.id ? null : entry.id)}
                onPatch={(change) => patch(entry.id, change)}
                onError={say}
              />
            ))}
          </section>
        ) : null}

        <section className={styles.group}>
          <span className={styles.groupLabel}>Today</span>
          {today.entries.length ? (
            today.entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                open={open === entry.id}
                onToggle={() => setOpen(open === entry.id ? null : entry.id)}
                onPatch={(change) => patch(entry.id, change)}
                onError={say}
              />
            ))
          ) : (
            <p className={styles.quiet}>Nothing on the calendar today.</p>
          )}
        </section>

        {today.releases.length || today.anniversaries.length ? (
          <section className={styles.group}>
            <span className={styles.groupLabel}>Releases</span>
            {today.releases.map((release) => (
              <p key={release.releaseId} className={styles.marker}>
                <Icon glyph="disc" size={15} /> {release.title} is out today
              </p>
            ))}
            {today.anniversaries.map((one) => (
              <p key={one.releaseId} className={styles.marker}>
                <Icon glyph="disc" size={15} /> {one.title} turns {one.years} today
              </p>
            ))}
          </section>
        ) : null}
      </div>

      {notice ? <p className={styles.popupNotice}>{notice}</p> : null}

      <div className={styles.popupActions}>
        <button
          type="button"
          className={styles.textButton}
          onClick={() => void window.candy.strip.openTarget({ kind: 'page', route: '/calendar' })}
        >
          Open CALENDAR
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => void window.candy.strip.popup({ kind: 'add' })}
        >
          <Icon glyph="add" size={14} /> Add
        </button>
      </div>
    </div>
  )
}

function EntryRow({
  entry,
  late = false,
  open,
  onToggle,
  onPatch,
  onError
}: {
  entry: CalendarEntry
  late?: boolean
  open: boolean
  onToggle: () => void
  onPatch: (change: CalendarPatch) => void
  onError: (message: string) => void
}): ReactNode {
  const { today, minute } = useNowMinute()
  const steps = entry.checklist.length
  const ticked = entry.checklist.filter((item) => item.done).length
  const when = late
    ? entry.date.slice(5).replace('-', '/')
    : entry.startMinute !== null
      ? clock(entry.startMinute)
      : 'All day'

  const later = (): void => {
    // An hour on, or to now and an hour if it has already started.
    const from = Math.max(entry.startMinute ?? minute, minute)
    const start = Math.min(from + 60, 23 * 60 + 30)
    onPatch({ date: today, startMinute: start })
  }

  const openPin = (pin: Pin): void => {
    if (pin.target.kind === 'folder') {
      void window.candy.strip.popup({ kind: 'folder', path: pin.target.path, label: pin.label })
      return
    }
    window.candy.strip.openTarget(pin.target).catch((cause: Error) => onError(cause.message))
  }

  return (
    <div className={styles.entry} data-done={entry.done || undefined} data-open={open || undefined}>
      <div className={styles.entryLine}>
        <button
          type="button"
          className={styles.tick}
          data-on={entry.done || undefined}
          aria-label={entry.done ? 'Not done' : 'Done'}
          onClick={() => onPatch({ done: !entry.done })}
        >
          {entry.done ? <Icon glyph="check" size={13} /> : null}
        </button>
        <button type="button" className={styles.entryMain} onClick={onToggle}>
          <span className={styles.entryWhen} data-late={late || undefined}>
            {when}
          </span>
          <span className={styles.entryTitle}>{entry.title}</span>
          <span className={styles.entryMeta}>
            {entry.attachments.length ? (
              <span className={styles.attachCount}>{entry.attachments.length}</span>
            ) : null}
            {steps ? (
              <span className={styles.steps}>
                {ticked}/{steps}
              </span>
            ) : null}
            <span className={styles.kind}>{CALENDAR_KIND[entry.kind].label}</span>
          </span>
        </button>
      </div>

      {open ? (
        <div className={styles.entryBody}>
          {entry.attachments.length ? (
            <div className={styles.attachments}>
              {entry.attachments.map((pin) => (
                <button
                  key={pin.id}
                  type="button"
                  className={styles.attachment}
                  title={pin.label}
                  onClick={() => openPin(pin)}
                >
                  <Icon glyph={targetGlyph(pin.target)} size={15} />
                  <span>{pin.label}</span>
                </button>
              ))}
            </div>
          ) : null}

          {entry.checklist.length ? (
            <ul className={styles.checklist}>
              {entry.checklist.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={styles.step}
                    data-on={item.done || undefined}
                    onClick={() =>
                      onPatch({
                        checklist: entry.checklist.map((step) =>
                          step.id === item.id ? { ...step, done: !step.done } : step
                        )
                      })
                    }
                  >
                    <span className={styles.stepBox}>
                      {item.done ? <Icon glyph="check" size={11} /> : null}
                    </span>
                    {item.text}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {entry.notes ? <p className={styles.notes}>{entry.notes}</p> : null}

          <div className={styles.entryActions}>
            {late ? (
              <button
                type="button"
                className={styles.textButton}
                onClick={() => onPatch({ date: today })}
              >
                Move to today
              </button>
            ) : (
              <button type="button" className={styles.textButton} onClick={later}>
                An hour later
              </button>
            )}
            <button
              type="button"
              className={styles.textButton}
              onClick={() => onPatch({ date: shiftDays(today, 1) })}
            >
              Tomorrow
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
