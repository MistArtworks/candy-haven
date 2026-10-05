import { useState, type ReactNode } from 'react'
import { formatMinute, parseMinute } from '@shared/domain/calendar.constants'
import { DateInput, TextInput } from '@renderer/components/primitives/Input'
import { DUE_PRESETS, fromDueParts, toDueParts } from './model'
import styles from './Leads.module.scss'

export interface DueFieldProps {
  label: string
  /** Epoch milliseconds. */
  value: number
  onChange: (at: number) => void
  hint?: string
}

/**
 * When a follow-up is due: a day, a time, and the usual answers a press away.
 *
 * The time is typed, 24-hour as the console is, rather than picked from half
 * hours as CALENDAR's starts are: "due now" is 00:37 as often as it's 10:30.
 * A time that isn't one stays on screen and is refused, as DateInput does
 * with a day, and the last good one holds meanwhile.
 */
export function DueField({ label, value, onChange, hint }: DueFieldProps): ReactNode {
  const parts = toDueParts(value)
  // What's typed, while it isn't a time yet; null shows the value itself.
  const [typing, setTyping] = useState<string | null>(null)
  const refused = typing !== null && timeOf(typing) === null

  return (
    <div className={styles.due}>
      <span className={styles.dueLabel}>{label}</span>
      <div className={styles.dueFields}>
        <DateInput
          label="Day"
          value={parts.date}
          clearable={false}
          onChange={(date) => {
            if (date) onChange(fromDueParts({ date, minute: parts.minute }))
          }}
        />
        <TextInput
          label="Time"
          value={typing ?? formatMinute(parts.minute)}
          mono
          maxLength={5}
          invalid={refused}
          hint={refused ? 'As 14:30' : undefined}
          onChange={(next) => {
            const minute = timeOf(next)
            if (minute === null) {
              setTyping(next)
              return
            }
            setTyping(null)
            onChange(fromDueParts({ date: parts.date, minute }))
          }}
        />
      </div>
      <div className={styles.presets} role="group" aria-label={`${label}: quick picks`}>
        {DUE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={styles.preset}
            onClick={() => {
              setTyping(null)
              onChange(preset.at(new Date()))
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {hint ? <p className={styles.dueHint}>{hint}</p> : null}
    </div>
  )
}

/**
 * A typed time, once it's whole. Three digits are left alone: "143" is on its
 * way to 14:30 far more often than it means 01:43, and taking it at its word
 * would rewrite the field under the next keystroke.
 */
function timeOf(text: string): number | null {
  return /^\d{3}$/.test(text.trim()) ? null : parseMinute(text)
}
