import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { getSection } from '@shared/domain/navigation'
import type { CalendarEntry } from '@shared/domain/calendar'
import {
  MONTH_NAMES,
  addDays,
  addMonths,
  parseIsoDate,
  weekOf
} from '@shared/domain/calendar.constants'
import { useCalendar, useCalendarActions } from '@renderer/hooks/useCalendar'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { formatIsoDate, todayIso } from '@renderer/lib/format'
import { CALENDAR_VIEW, CALENDAR_VIEWS, isCalendarView, type CalendarView } from './views'
import { MonthView } from './components/MonthView'
import { DayView } from './components/DayView'
import { AgendaView } from './components/AgendaView'
import { TimeGrid } from './components/TimeGrid'
import { EntryDialog, type EntryDialogSubject, type EntryValues } from './components/EntryDialog'
import styles from './CalendarPage.module.scss'

/**
 * CALENDAR — the dated register.
 *
 * Four lenses over one array. The lens lives in the URL, as REGULATION's
 * category does, so a link can point at the agenda and the back gesture walks
 * the views rather than leaving the department; the anchor date is local state,
 * because paging through March is not something anybody wants seven history
 * entries of.
 *
 * Nothing here is derived from a project or a release. An entry is the
 * operator's own statement that something happens on a date — see the note in
 * shared/domain/calendar.ts for why that boundary is worth keeping.
 */
export function CalendarPage(): ReactNode {
  const section = getSection('calendar')
  const { state, ready } = useCalendar()
  const actions = useCalendarActions()

  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get('view')
  const view: CalendarView = isCalendarView(raw) ? raw : 'month'

  const [anchor, setAnchor] = useState(todayIso)
  const [subject, setSubject] = useState<EntryDialogSubject | null>(null)

  const selectView = (next: CalendarView): void => {
    setSearchParams({ view: next }, { replace: true })
  }

  /** Moves the anchor by one period of whatever lens is open. */
  const step = (direction: 1 | -1): void => {
    const { unit, amount } = CALENDAR_VIEW[view].step
    const delta = amount * direction

    if (unit === 'month') setAnchor(addMonths(anchor, delta))
    else if (unit === 'week') setAnchor(addDays(anchor, delta * 7))
    else setAnchor(addDays(anchor, delta))
  }

  const { year, month } = parseIsoDate(anchor)
  const week = useMemo(() => weekOf(anchor), [anchor])

  /** What the period control is currently showing, in the register's voice. */
  const periodTitle = ((): string => {
    switch (view) {
      case 'month':
        return `${MONTH_NAMES[month - 1]} ${year}`
      case 'week':
        return `${formatIsoDate(week[0])} — ${formatIsoDate(week[6])}`
      case 'day':
        return formatIsoDate(anchor)
      case 'agenda':
        return `FROM ${formatIsoDate(anchor)}`
    }
  })()

  const inPeriod = useMemo(() => {
    switch (view) {
      case 'month':
        return state.entries.filter((entry) => entry.date.slice(0, 7) === anchor.slice(0, 7)).length
      case 'week':
        return state.entries.filter((entry) => entry.date >= week[0] && entry.date <= week[6])
          .length
      case 'day':
        return state.entries.filter((entry) => entry.date === anchor).length
      case 'agenda':
        return state.entries.filter((entry) => entry.date >= anchor).length
    }
  }, [state.entries, view, anchor, week])

  const openEntry = (entry: CalendarEntry): void => {
    actions.clearError()
    setSubject({ mode: 'edit', entry })
  }

  const openDate = (date: string, startMinute: number | null = null): void => {
    actions.clearError()
    setSubject({ mode: 'create', date, startMinute })
  }

  const inspectDate = (date: string): void => {
    setAnchor(date)
    selectView('day')
  }

  const toggleDone = (entry: CalendarEntry): void => {
    void actions.patch(entry.id, { done: !entry.done }).catch(() => {
      // Reported through `actions.error`, which the dialog and the notice both
      // read; a failed toggle must not throw out of an event handler.
    })
  }

  const commitCreate = (values: EntryValues): void => {
    void actions
      .create({
        title: values.title,
        kind: values.kind,
        date: values.date,
        startMinute: values.startMinute,
        durationMinutes: values.durationMinutes,
        notes: values.notes
      })
      .then(() => setSubject(null))
      .catch(() => undefined)
  }

  const commitSave = (id: string, values: EntryValues): void => {
    void actions
      .patch(id, {
        title: values.title,
        kind: values.kind,
        date: values.date,
        startMinute: values.startMinute,
        durationMinutes: values.durationMinutes,
        notes: values.notes
      })
      .then(() => setSubject(null))
      .catch(() => undefined)
  }

  const commitDelete = (id: string): void => {
    void actions
      .remove(id)
      .then(() => setSubject(null))
      .catch(() => undefined)
  }

  return (
    <div className={styles.page}>
      <PageHeader
        index={section.order + 1}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
        actions={
          <div className={styles.headActions}>
            <StatusDot
              tone={state.attached ? 'online' : ready ? 'error' : 'pending'}
              label={state.attached ? `${state.entries.length} FILED` : 'NOT ATTACHED'}
              pulse={!ready}
            />
            <Button size="sm" disabled={!state.attached} onClick={() => openDate(anchor)}>
              File entry
            </Button>
          </div>
        }
      />

      <div className={styles.toolbar}>
        <div className={styles.period}>
          <button
            type="button"
            className={styles.periodStep}
            onClick={() => step(-1)}
            aria-label="Previous period"
          >
            ‹
          </button>
          <button
            type="button"
            className={styles.periodStep}
            onClick={() => step(1)}
            aria-label="Next period"
          >
            ›
          </button>
          <button
            type="button"
            className={styles.periodToday}
            onClick={() => setAnchor(todayIso())}
          >
            TODAY
          </button>

          <h2 className={styles.periodTitle}>{periodTitle}</h2>
          <span className={styles.periodCount}>
            {inPeriod} {inPeriod === 1 ? 'ENTRY' : 'ENTRIES'}
          </span>
        </div>

        {/* The lens rail, numbered like every other order of navigation here. */}
        <nav className={styles.viewNav} aria-label="Calendar views">
          {CALENDAR_VIEWS.map((id, index) => (
            <button
              key={id}
              type="button"
              className={styles.viewItem}
              data-active={id === view || undefined}
              aria-current={id === view ? 'page' : undefined}
              title={CALENDAR_VIEW[id].purpose}
              onClick={() => selectView(id)}
            >
              <span className={styles.viewIndex}>{String(index + 1).padStart(2, '0')}</span>
              {CALENDAR_VIEW[id].label}
            </button>
          ))}
        </nav>
      </div>

      {!state.attached && ready ? (
        <p className={styles.detached}>
          THE REGISTER IS NOT ATTACHED. Entries are held in the archive; check it in REGULATION.
        </p>
      ) : null}

      {actions.error && !subject ? <p className={styles.detached}>{actions.error}</p> : null}

      <motion.div className={styles.stage} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <Panel
          label={CALENDAR_VIEW[view].label}
          index={String(CALENDAR_VIEWS.indexOf(view) + 1).padStart(2, '0')}
          aside={CALENDAR_VIEW[view].purpose}
          flush
          className={styles.stagePanel}
        >
          {view === 'month' ? (
            <MonthView
              anchor={anchor}
              entries={state.entries}
              onOpenEntry={openEntry}
              onOpenDate={(date) => openDate(date)}
              onInspectDate={inspectDate}
            />
          ) : null}

          {view === 'week' ? (
            <TimeGrid
              dates={week}
              entries={state.entries}
              onOpenEntry={openEntry}
              onOpenSlot={(date, startMinute) => openDate(date, startMinute)}
              onInspectDate={inspectDate}
            />
          ) : null}

          {view === 'day' ? (
            <DayView
              date={anchor}
              entries={state.entries}
              onOpenEntry={openEntry}
              onOpenSlot={(date, startMinute) => openDate(date, startMinute)}
              onToggleDone={toggleDone}
            />
          ) : null}

          {view === 'agenda' ? (
            <AgendaView
              from={anchor}
              entries={state.entries}
              onOpenEntry={openEntry}
              onToggleDone={toggleDone}
              onInspectDate={inspectDate}
            />
          ) : null}
        </Panel>
      </motion.div>

      <EntryDialog
        subject={subject}
        busy={actions.busy}
        error={actions.error}
        onClose={() => setSubject(null)}
        onCreate={commitCreate}
        onSave={commitSave}
        onDelete={commitDelete}
      />
    </div>
  )
}
