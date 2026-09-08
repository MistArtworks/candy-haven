import { SettingsService } from './settings/settings.service'
import { ArchiveService } from './archive/archive.service'
import { UpdateService } from './update/update.service'
import { TelemetryService } from './telemetry/telemetry.service'
import { ProjectsService } from './projects/projects.service'
import { OverlayServer } from './overlay/overlay-server'
import { RiteService } from './overlay/rite.service'
import { TimerService } from './overlay/timer.service'
import { SpotifyService } from './overlay/spotify.service'
import { getLogger } from '@main/core/logger'

const logger = getLogger('container')

/**
 * Composition root for main-process services.
 *
 * Services are constructed once and passed explicitly to the code that needs
 * them; nothing reaches for a global. This keeps dependencies visible and lets
 * each service be exercised in isolation.
 */
export interface ServiceContainer {
  readonly settings: SettingsService
  readonly archive: ArchiveService
  readonly updates: UpdateService
  readonly telemetry: TelemetryService
  readonly projects: ProjectsService
  /** Shared by every overlay: one HTTP server, many pages. */
  readonly overlayServer: OverlayServer
  readonly rite: RiteService
  readonly timers: TimerService
  readonly nowPlaying: SpotifyService
}

export function createServiceContainer(): ServiceContainer {
  // Projects and the rite both read through the archive connection, so they are
  // the services here that take a collaborator rather than standing alone.
  const archive = new ArchiveService()
  // Hoisted out of the rite: the countdowns broadcast through the same stream,
  // so the server is department infrastructure rather than one feature's.
  const overlayServer = new OverlayServer()

  return {
    settings: new SettingsService(),
    archive,
    updates: new UpdateService(),
    telemetry: new TelemetryService(),
    projects: new ProjectsService(archive),
    overlayServer,
    rite: new RiteService(archive, overlayServer),
    timers: new TimerService(archive, overlayServer),
    nowPlaying: new SpotifyService(archive, overlayServer)
  }
}

/**
 * Tears services down in reverse dependency order. Every step is isolated so a
 * failure in one service cannot prevent the others from releasing resources —
 * important because this runs on the quit path.
 */
export async function disposeServiceContainer(container: ServiceContainer): Promise<void> {
  logger.info('Disposing services')

  // Before the archive: the overlay services mirror state to Mongo on the way
  // down, and the server holds event-stream sockets that must be released or
  // quit waits on them.
  try {
    await container.overlayServer.stop()
  } catch (error) {
    logger.error('Overlay server shutdown failed', error)
  }

  container.rite.dispose()
  container.timers.dispose()
  container.nowPlaying.dispose()

  try {
    await container.archive.shutdown()
  } catch (error) {
    logger.error('Archive shutdown failed', error)
  }

  container.projects.dispose()
  container.telemetry.dispose()
  container.settings.clear()
  container.archive.clear()
  container.updates.clear()

  logger.info('Services disposed')
}
