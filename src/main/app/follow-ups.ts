import { Notification } from 'electron'
import { DUE_ON_ARRIVAL_MS, TASK_PRIORITY_LABEL } from '@shared/domain/leads.constants'
import { getLogger } from '@main/core/logger'
import type { OpenTask } from '@main/services/leads/leads.service'

const logger = getLogger('follow-ups')

/** How often the follow-ups are looked at. */
const EVERY_MS = 30_000

/** More than this coming due at once (back from sleep) is one notice, not a stack. */
const AT_ONCE = 2

export interface FollowUpHost {
  /**
   * Every follow-up not done, archived leads left out; null while the archive
   * isn't there to say, so an empty first look isn't taken for the opening.
   */
  tasks(): Promise<OpenTask[] | null>
  /** REGULATION's switch. */
  enabled(): boolean
  /** One reminder was clicked: show it, with what can be done about it. */
  open(task: OpenTask): void
  /** A notice for several was clicked: show them all. */
  openAll(): void
  /**
   * Which follow-ups are overdue changed, by the clock alone: CALENDAR reads
   * a follow-up's status when it's drawn, so it's told to draw again.
   */
  overdueChanged(): void
}

/**
 * Reminders for ARTISTS' follow-ups.
 *
 * Nothing nags about a follow-up that isn't due. On opening, whatever is
 * already overdue is said once, in one notice; after that, each follow-up
 * gets one notice when it comes due. A snooze is a new due time (it reminds
 * again when it ends), a dismissal ends its reminders, and completing it
 * takes it out of the list altogether.
 *
 * A follow-up made already due, as a new lead's first interaction is by
 * default, says nothing in the sitting it's made in: Candy is looking at it.
 * It stays overdue on the strip and in the console, and the next opening
 * brings it up with the rest.
 *
 * Kept in memory, as CALENDAR's reminders are: once per sitting, keyed by the
 * task and its times, so moving or snoozing one reminds again.
 */
export class FollowUpReminders {
  private timer: NodeJS.Timeout | null = null
  private readonly fired = new Set<string>()
  private readonly shown = new Set<Notification>()
  private readonly startedAt = Date.now()
  private opened = false
  /** The overdue follow-ups at the last look, as one key. */
  private overdue = ''

  constructor(private readonly host: FollowUpHost) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.check(), EVERY_MS)
    void this.check()
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.shown.clear()
  }

  private async check(): Promise<void> {
    let tasks: OpenTask[] | null
    try {
      tasks = await this.host.tasks()
    } catch {
      return
    }
    if (tasks === null) return
    const now = Date.now()

    // Watched whether or not reminders are on: CALENDAR shows it either way.
    const overdue = tasks
      .filter((task) => task.dueAt <= now)
      .map((task) => task.ref.taskId)
      .sort()
      .join('|')
    if (overdue !== this.overdue) {
      this.overdue = overdue
      this.host.overdueChanged()
    }

    if (!this.host.enabled() || !Notification.isSupported()) return
    const due = tasks.filter((task) => remindable(task, now) && !this.fired.has(key(task)))
    for (const task of due) this.fired.add(key(task))

    // The first look is the opening: everything overdue, said once.
    if (!this.opened) {
      this.opened = true
      if (due.length > 0) this.say(due, 'opening')
      return
    }

    const fresh = due.filter((task) => !madeDue(task, this.startedAt))
    if (fresh.length > 0) this.say(fresh, 'due')
  }

  private say(tasks: OpenTask[], when: 'opening' | 'due'): void {
    if (tasks.length <= AT_ONCE && when === 'due') {
      for (const task of tasks) this.one(task)
      return
    }
    if (tasks.length === 1) {
      this.one(tasks[0])
      return
    }
    const names = [...new Set(tasks.map((task) => task.who))]
    const body =
      names.length <= 2
        ? names.join(' and ')
        : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
    const title = `${tasks.length} follow-ups ${when === 'opening' ? 'overdue' : 'due'}`
    this.notify(title, body, () => this.host.openAll())
    logger.info(title)
  }

  private one(task: OpenTask): void {
    const body = [
      task.title,
      task.priority === 'high' ? TASK_PRIORITY_LABEL.high : null,
      `Due ${dueAt(task.dueAt)}`
    ]
      .filter(Boolean)
      .join(' · ')
    this.notify(`Follow up: ${task.who}`, body, () => this.host.open(task))
    logger.info(`Reminded of a follow-up for "${task.who}"`)
  }

  private notify(title: string, body: string, onClick: () => void): void {
    const notification = new Notification({ title, body })
    const release = (): void => {
      this.shown.delete(notification)
    }
    notification.on('click', () => {
      release()
      onClick()
    })
    notification.on('close', release)
    this.shown.add(notification)
    notification.show()
  }
}

/** Due, and neither snoozed past now nor dismissed. */
function remindable(task: OpenTask, now: number): boolean {
  if (task.dismissedAt !== null || task.dueAt > now) return false
  return task.snoozedUntil === null || task.snoozedUntil <= now
}

/** Made already due, in this sitting: the one that never pops up at once. */
function madeDue(task: OpenTask, startedAt: number): boolean {
  return (
    task.createdAt >= startedAt &&
    task.snoozedUntil === null &&
    task.dueAt - task.createdAt <= DUE_ON_ARRIVAL_MS
  )
}

/** A new due time, or a snooze ending, is a new reminder. */
function key(task: OpenTask): string {
  return `${task.ref.taskId}|${task.dueAt}|${task.snoozedUntil ?? ''}`
}

/** "14:30" today, else "Mon 6 Oct, 14:30". */
function dueAt(at: number): string {
  const date = new Date(at)
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === new Date().toDateString()) return time
  const day = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  return `${day}, ${time}`
}
