import { useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { TransmissionViewMode } from '@shared/domain/transmissions'
import {
  TRANSMISSION_VIEW_LABEL,
  TRANSMISSION_VIEW_MODES,
  collisionsByDate,
  groupEntriesByDate,
  nextRelease,
  overdueWindows
} from '@shared/domain/transmissions.constants'
import { getSection } from '@shared/domain/navigation'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { gridVariants } from '@renderer/motion/transitions'
import { todayIso } from '@renderer/lib/format'
import { useSchedule } from '@renderer/hooks/useTransmissions'
import { NextTransmission } from './components/NextTransmission'
import { Imminent } from './components/Imminent'
import { Conflicts } from './components/Conflicts'
import { MonthView } from './components/MonthView'
import { WeekView } from './components/WeekView'
import { AgendaView } from './components/AgendaView'
import { TimelineView } from './components/TimelineView'
import { DayManifest } from './components/DayManifest'
import { rangeLabel, stepAnchor } from './lib/calendar'
import styles from './TransmissionsPage.module.scss'

/**
 * TRANSMISSIONS — release and promotional scheduling.
 *
 * Every date on this page belongs to something else. A release date is a
 * project's, a promotional deliverable's date is its plan's, and this
 * department reads both rather than keeping copies that could drift. What it
 * adds is the thing no dossier can show: all of them at once, and therefore
 * whether two campaigns are about to collide.
 *
 * The exception is tasks, which it does own — because not everything on an
 * operator's calendar is owed by a release.
 *
 * Four views over one set of entries. The switch is a presentation choice and
 * nothing else: no view fetches differently, and all four hand off to the same
 * day manifest, which is the only place anything is written.
 */
export function TransmissionsPage(): ReactNode {
  const section = getSection('transmissions')
  const { data: schedule, isLoading, isError, error } = useSchedule()

  const [view, setView] = useState<TransmissionViewMode>('month')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // Today is read once per render rather than per cell. It is also the anchor's
  // initial value, so the page opens on the month the operator is living in.
  const today = todayIso()
  const [anchor, setAnchor] = useState(today)

  const entries = useMemo(() => schedule?.entries ?? [], [schedule])
  const collisions = useMemo(() => schedule?.collisions ?? [], [schedule])

  const entriesByDate = useMemo(() => groupEntriesByDate(entries), [entries])
  const collisionsByDay = useMemo(() => collisionsByDate(collisions), [collisions])
  const upcoming = useMemo(() => nextRelease(entries, today), [entries, today])
  const overdue = useMemo(() => overdueWindows(schedule?.windows ?? []), [schedule])

  const releaseWindow = schedule?.windows.find(
    (candidate) => candidate.projectId === upcoming?.projectId
  )

  const conflictCount = collisions.length + overdue.length

  return (
    <div className={styles.page}>
      <PageHeader
        index={section.order + 1}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
        actions={
          <div className={styles.headerActions}>
            <span className={styles.headerFigure}>{entries.length} DATED</span>
            <StatusDot
              tone={conflictCount > 0 ? 'warn' : 'online'}
              label={
                conflictCount > 0
                  ? `${conflictCount} conflict${conflictCount === 1 ? '' : 's'}`
                  : 'Schedule clear'
              }
            />
          </div>
        }
      />

      {isError ? (
        <p className={styles.notice}>
          {error instanceof Error ? error.message : 'The schedule could not be read.'}
        </p>
      ) : null}

      {schedule && schedule.excludedCount > 0 ? (
        <p className={styles.footnote}>
          {schedule.excludedCount} project{schedule.excludedCount === 1 ? '' : 's'} excluded as
          missing from disk or shelved.
        </p>
      ) : null}

      <motion.div
        className={styles.grid}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        <Panel label="Next transmission" index="01" className={styles.span2} focal>
          <NextTransmission
            release={upcoming}
            window={releaseWindow}
            leadDays={schedule?.leadDays ?? 0}
          />
        </Panel>

        <Panel label="Imminent" index="02" className={styles.span2}>
          <Imminent
            entries={entries}
            today={today}
            nextReleaseDate={upcoming?.date ?? null}
            onSelectDay={setSelectedDay}
          />
        </Panel>

        <Panel
          label="Conflicts"
          index="03"
          className={styles.span2}
          aside={conflictCount > 0 ? String(conflictCount) : undefined}
        >
          <Conflicts collisions={collisions} overdue={overdue} onSelectDay={setSelectedDay} />
        </Panel>

        <Panel
          label="The calendar"
          index="04"
          className={styles.span6}
          flush
          aside={
            <div className={styles.calendarControls}>
              <div className={styles.viewSwitch} role="group" aria-label="Calendar view">
                {TRANSMISSION_VIEW_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={styles.viewButton}
                    data-active={mode === view || undefined}
                    onClick={() => setView(mode)}
                  >
                    {TRANSMISSION_VIEW_LABEL[mode]}
                  </button>
                ))}
              </div>

              {/* The agenda runs forward from today and has nothing to page. */}
              {view === 'agenda' ? null : (
                <div className={styles.rangeControls}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAnchor(stepAnchor(anchor, view, -1))}
                  >
                    ‹
                  </Button>
                  <span className={styles.rangeLabel}>{rangeLabel(anchor, view)}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAnchor(stepAnchor(anchor, view, 1))}
                  >
                    ›
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAnchor(today)}>
                    Today
                  </Button>
                </div>
              )}
            </div>
          }
        >
          <div className={styles.calendarBody}>
            {isLoading ? (
              <p className={styles.loading}>Reading the register…</p>
            ) : entries.length === 0 ? (
              <p className={styles.loading}>
                Nothing is dated yet. Set a release date on a project, or file a task on a day.
              </p>
            ) : view === 'month' ? (
              <MonthView
                anchor={anchor}
                today={today}
                selected={selectedDay}
                entriesByDate={entriesByDate}
                collisionsByDay={collisionsByDay}
                onSelectDay={setSelectedDay}
              />
            ) : view === 'week' ? (
              <WeekView
                anchor={anchor}
                today={today}
                selected={selectedDay}
                entriesByDate={entriesByDate}
                collisionsByDay={collisionsByDay}
                onSelectDay={setSelectedDay}
              />
            ) : view === 'agenda' ? (
              <AgendaView
                entries={entries}
                today={today}
                collisionsByDay={collisionsByDay}
                onSelectDay={setSelectedDay}
              />
            ) : (
              <TimelineView
                anchor={anchor}
                today={today}
                entries={entries}
                collisions={collisions}
                onSelectDay={setSelectedDay}
              />
            )}

            <AnimatePresence initial={false}>
              {selectedDay ? (
                <motion.div
                  key={selectedDay}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <DayManifest
                    date={selectedDay}
                    entries={entriesByDate.get(selectedDay) ?? []}
                    collision={collisionsByDay.get(selectedDay)}
                    onClose={() => setSelectedDay(null)}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </Panel>
      </motion.div>
    </div>
  )
}
