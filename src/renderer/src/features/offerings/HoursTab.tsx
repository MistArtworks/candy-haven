import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import {
  OfferingHoursSchema,
  hoursProblems,
  type OfferingHours,
  type OfferingsState
} from '@shared/domain/offerings'
import {
  BUFFER_MINUTES,
  HORIZON_MONTHS,
  NOTICE_HOURS,
  QUARTER_HOURS,
  WEEKDAYS,
  WEEKDAY_LABEL,
  type Weekday
} from '@shared/domain/offerings.constants'
import { useSystemStore } from '@renderer/app/store/system.store'
import { Panel } from '@renderer/components/primitives/Panel'
import { DateInput, SelectInput } from '@renderer/components/primitives/Input'
import { Select } from '@renderer/components/primitives/Select'
import { gridVariants } from '@renderer/motion/transitions'
import type { OfferingsActions } from '@renderer/hooks/useOfferings'
import lore from '@renderer/features/lore/Lore.module.scss'
import { PublishBar } from './PublishBar'
import styles from './Offerings.module.scss'

const same = (a: OfferingHours, b: OfferingHours): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

const DAY = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
})

/** A day off as people read it: `Fri 24 December 2027`. */
function dayLabel(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return DAY.format(new Date(year, month - 1, date))
}

const hoursLabel = (hours: number): string =>
  hours === 0
    ? 'None: right up to the time'
    : hours < 24
      ? `${hours} hour${hours === 1 ? '' : 's'}`
      : hours % 24 === 0
        ? `${hours / 24} day${hours === 24 ? '' : 's'}`
        : `${hours} hours`

const NOTICE_OPTIONS = NOTICE_HOURS.map((hours) => ({
  value: String(hours),
  label: hoursLabel(hours)
}))
const HORIZON_OPTIONS = HORIZON_MONTHS.map((months) => ({
  value: String(months),
  label: `${months} month${months === 1 ? '' : 's'}`
}))
const BUFFER_OPTIONS = BUFFER_MINUTES.map((minutes) => ({
  value: String(minutes),
  label: minutes === 0 ? 'None' : `${minutes} min`
}))

/** Every zone this PC knows, and the one set, whatever it is. */
function zoneOptions(current: string): { value: string; label: string }[] {
  let zones: string[] = []
  try {
    zones = Intl.supportedValuesOf('timeZone')
  } catch {
    zones = []
  }
  if (!zones.includes(current)) zones = [current, ...zones]
  return zones.map((zone) => ({ value: zone, label: zone.replace(/_/g, ' ') }))
}

/**
 * HOURS: when the website lets people book a 1-1 session. Start times for
 * each day of the week, in Candy's zone (the website shows them to each
 * visitor in theirs); days off; and the rules around them. Anything busy on
 * Candy's Google Calendar, and every session already booked, shows as
 * taken on the website whatever these say.
 *
 * Until hours are saved here, these are the website's, to start from.
 * Saved here through the unsaved-changes bar, and published with the
 * services, in the same Publish.
 */
export function HoursTab({
  state,
  actions
}: {
  state: OfferingsState
  actions: OfferingsActions
}): ReactNode {
  const base = useMemo<OfferingHours>(
    () => state.hours ?? state.site?.hours ?? OfferingHoursSchema.parse({}),
    [state.hours, state.site]
  )
  const [hours, setHours] = useState<OfferingHours>(base)
  const dirty = !same(hours, base)

  const [previousBase, setPreviousBase] = useState(base)
  if (!same(previousBase, base)) {
    setPreviousBase(base)
    if (same(hours, previousBase)) setHours(base)
  }

  const problem = hoursProblems(hours)[0] ?? null
  const save = async (): Promise<boolean> => (await actions.saveHours(hours)) !== null
  const discard = (): void => setHours(base)

  const setUnsaved = useSystemStore((s) => s.setUnsaved)
  const latest = useRef({ save, discard })
  useEffect(() => {
    latest.current = { save, discard }
  })
  const saving = actions.pending === 'save-hours'
  useEffect(() => {
    setUnsaved({
      dirty,
      saving,
      error: problem,
      subject: 'the hours',
      save: () => void latest.current.save(),
      discard: () => latest.current.discard()
    })
  }, [dirty, saving, problem, setUnsaved])
  useEffect(() => () => setUnsaved(null), [setUnsaved])

  const setDay = (day: Weekday, times: string[]): void =>
    setHours((current) => ({
      ...current,
      weekly: { ...current.weekly, [day]: [...new Set(times)].sort() }
    }))
  const copyToAll = (day: Weekday): void =>
    setHours((current) => ({
      ...current,
      weekly: Object.fromEntries(
        WEEKDAYS.map((other) => [
          other,
          current.weekly[other].length || other === day ? current.weekly[day] : []
        ])
      ) as OfferingHours['weekly']
    }))

  const zones = useMemo(() => zoneOptions(hours.timeZone), [hours.timeZone])
  const zoneName =
    new Intl.DateTimeFormat('en-GB', { timeZone: hours.timeZone, timeZoneName: 'longGeneric' })
      .formatToParts(new Date())
      .find((part) => part.type === 'timeZoneName')?.value ?? hours.timeZone
  const offered = WEEKDAYS.reduce((sum, day) => sum + hours.weekly[day].length, 0)

  return (
    <>
      <PublishBar state={state} actions={actions} />

      {!state.hours ? (
        <p className={lore.notice}>
          <span className={lore.noticeLabel}>The website’s</span>
          These are the hours the website has now. Change and save them to make them yours here;
          they go to the website with the next Publish.
        </p>
      ) : null}

      <motion.div
        className={styles.hoursGrid}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        <Panel
          label="The week"
          index="01"
          focal
          className={styles.weekPanel}
          aside={
            <span className={lore.count}>
              {offered} start time{offered === 1 ? '' : 's'} a week, {zoneName}
            </span>
          }
        >
          <div className={styles.week}>
            {WEEKDAYS.map((day) => {
              const times = hours.weekly[day]
              const free = QUARTER_HOURS.filter((time) => !times.includes(time)).map((time) => ({
                value: time,
                label: time
              }))
              return (
                <div key={day} className={styles.day}>
                  <span className={styles.dayName}>{WEEKDAY_LABEL[day]}</span>
                  <div className={styles.times}>
                    {times.length ? (
                      times.map((time) => (
                        <span key={time} className={styles.time}>
                          {time}
                          <button
                            type="button"
                            className={styles.timeRemove}
                            aria-label={`Take ${time} off ${WEEKDAY_LABEL[day]}`}
                            onClick={() =>
                              setDay(
                                day,
                                times.filter((t) => t !== time)
                              )
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className={styles.closed}>No sessions</span>
                    )}
                  </div>
                  <div className={styles.dayTools}>
                    <Select
                      ariaLabel={`Add a time on ${WEEKDAY_LABEL[day]}`}
                      value=""
                      placeholder="Add a time"
                      options={free}
                      onChange={(time) => {
                        if (time) setDay(day, [...times, time])
                      }}
                      className={styles.addTime}
                    />
                    <button
                      type="button"
                      className={lore.quiet}
                      disabled={!times.length}
                      onClick={() => copyToAll(day)}
                      title="These times on every other day that has sessions"
                    >
                      Same on the other open days
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <p className={lore.footnote}>
            Each time is when a session can start, in {zoneName}. Visitors see them in their own
            zone. A session runs as long as its service says; anything on your Google Calendar, and
            every session already booked, shows as taken.
          </p>
        </Panel>

        <div className={styles.sidePanel}>
          <Panel label="Days off" index="02">
            {hours.closed.length ? (
              <ul className={styles.daysOff}>
                {hours.closed.map((day) => (
                  <li key={day} className={styles.dayOff}>
                    {dayLabel(day)}
                    <button
                      type="button"
                      className={styles.timeRemove}
                      aria-label={`Take ${dayLabel(day)} off the days off`}
                      onClick={() =>
                        setHours((current) => ({
                          ...current,
                          closed: current.closed.filter((d) => d !== day)
                        }))
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={lore.footnote}>
                None. A day off here has no times, whatever the week says.
              </p>
            )}
            <div className={styles.addDay}>
              <DateInput
                key={hours.closed.length}
                label="Add a day off"
                value=""
                onChange={(day) => {
                  if (!day || hours.closed.includes(day)) return
                  setHours((current) => ({ ...current, closed: [...current.closed, day].sort() }))
                }}
                hint="Pick it, or type it and press Enter."
                clearable={false}
              />
            </div>
          </Panel>

          <Panel label="The rules" index="03">
            <div className={styles.rules}>
              <SelectInput
                label="Time zone"
                value={hours.timeZone}
                options={zones}
                onChange={(timeZone) => setHours((current) => ({ ...current, timeZone }))}
                hint="Where the times above are read."
              />
              <SelectInput
                label="Notice"
                value={String(hours.noticeHours)}
                options={NOTICE_OPTIONS}
                onChange={(value) =>
                  setHours((current) => ({ ...current, noticeHours: Number(value) }))
                }
                hint="How long before a session it can still be booked."
              />
              <SelectInput
                label="How far ahead"
                value={String(hours.horizonMonths)}
                options={HORIZON_OPTIONS}
                onChange={(value) =>
                  setHours((current) => ({ ...current, horizonMonths: Number(value) }))
                }
                hint="To the end of the month this many months on."
              />
              <SelectInput
                label="A break between sessions"
                value={String(hours.bufferMinutes)}
                options={BUFFER_OPTIONS}
                onChange={(value) =>
                  setHours((current) => ({ ...current, bufferMinutes: Number(value) }))
                }
                hint="Free time after one before the next can start."
              />
            </div>
          </Panel>
        </div>
      </motion.div>
    </>
  )
}
