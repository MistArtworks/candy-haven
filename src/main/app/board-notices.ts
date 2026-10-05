import { Notification } from 'electron'
import type { DispatchNotice } from '@shared/domain/dispatch'
import { describeNotice } from '@shared/domain/dispatch.unread'

export interface BoardNoticeHost {
  /** REGULATION's switch, under BOARD. */
  enabled(): boolean
  /** The console is on screen and in front, so its own notice is enough. */
  inFront(): boolean
  /** Tells the console, which shows a notice unless DISPATCH is already open. */
  toConsole(notice: DispatchNotice): void
  /** A Windows notice was clicked: the item, or the board for several. */
  open(itemId: string | null): void
}

/**
 * DISPATCH's notices, as CONTACT and SERVICES have theirs.
 *
 * What the other person did on the board (filed an item, commented, changed a
 * status) is told twice over, in the place that will be seen: the console
 * always hears of it and shows a notice if it is up, and Windows shows one too
 * when the console isn't in front, which is most of the time, since Haven
 * usually sits on the strip. Clicked, either opens the item.
 *
 * What to say is `describeNotice`, shared with the console so both say it the
 * same way; what changed is the service's (`DispatchService.tell`).
 */
export class BoardNotices {
  private readonly shown = new Set<Notification>()

  constructor(private readonly host: BoardNoticeHost) {}

  arrived(notice: DispatchNotice): void {
    if (!this.host.enabled()) return

    this.host.toConsole(notice)
    if (this.host.inFront() || !Notification.isSupported()) return

    for (const line of describeNotice(notice)) {
      const notification = new Notification({ title: line.label, body: line.detail })
      // Held until it closes, or Windows can drop the click along with it.
      const release = (): void => {
        this.shown.delete(notification)
      }
      notification.on('click', () => {
        release()
        this.host.open(line.itemId)
      })
      notification.on('close', release)
      this.shown.add(notification)
      notification.show()
    }
  }

  dispose(): void {
    this.shown.clear()
  }
}
