/**
 * The lenses the register can be read through.
 *
 * A table rather than a switch written into the page, for the same reason
 * REGULATION's categories are one: the view rail and the view itself are then
 * generated from a single source and cannot disagree about what exists.
 */
export const CALENDAR_VIEWS = ['month', 'week', 'day', 'agenda'] as const

export type CalendarView = (typeof CALENDAR_VIEWS)[number]

export interface CalendarViewDefinition {
  id: CalendarView
  label: string
  /** What this lens is for, in a line. Carried as the control's title. */
  purpose: string
  /** How far one step of the period control moves, and in what unit. */
  step: { unit: 'day' | 'week' | 'month'; amount: number }
}

export const CALENDAR_VIEW: Record<CalendarView, CalendarViewDefinition> = {
  month: {
    id: 'month',
    label: 'MONTH',
    purpose: 'Six weeks at once — where the work falls',
    step: { unit: 'month', amount: 1 }
  },
  week: {
    id: 'week',
    label: 'WEEK',
    purpose: 'Seven days against the clock',
    step: { unit: 'week', amount: 1 }
  },
  day: {
    id: 'day',
    label: 'DAY',
    purpose: 'One day, hour by hour',
    step: { unit: 'day', amount: 1 }
  },
  agenda: {
    id: 'agenda',
    label: 'AGENDA',
    purpose: 'The register as a list, from here forward',
    step: { unit: 'month', amount: 1 }
  }
}

export function isCalendarView(value: string | null): value is CalendarView {
  return value !== null && CALENDAR_VIEWS.includes(value as CalendarView)
}
