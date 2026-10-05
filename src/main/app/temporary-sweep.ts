import { getLogger } from '@main/core/logger'

const logger = getLogger('temporary')

/** The shortest keep is a day, so an hour late is the latest a set ever goes. */
const EVERY_MS = 60 * 60 * 1000

/**
 * When temporary projects are cleared out: once after boot, then every hour.
 *
 * Only the when. What goes, and what is spared, is
 * `StacksService.sweepTemporaryProjects`. A change to the keep in REGULATION
 * needs nothing here: the next pass reads it.
 */
export class TemporarySweep {
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly sweep: () => Promise<number>) {}

  start(): void {
    if (this.timer) return
    this.run()
    this.timer = setInterval(() => this.run(), EVERY_MS)
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private run(): void {
    void this.sweep().catch((error) => logger.warn('The temporary clean-up failed', error))
  }
}
