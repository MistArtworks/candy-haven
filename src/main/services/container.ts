import { SettingsService } from './settings/settings.service'
import { ArchiveService } from './archive/archive.service'
import { UpdateService } from './update/update.service'
import { TelemetryService } from './telemetry/telemetry.service'
import { ProjectsService } from './projects/projects.service'
import { StacksService } from './stacks/stacks.service'
import { VolumesService } from './volumes/volumes.service'
import { ReleasesService } from './releases/releases.service'
import { CalendarService } from './calendar/calendar.service'
import { OverlayServer } from './overlay/overlay-server'
import { RiteService } from './overlay/rite.service'
import { TimerService } from './overlay/timer.service'
import { SpotifyService } from './overlay/spotify.service'
import { DispatchService } from './dispatch/dispatch.service'
import { ConcordService } from './overlay/concord.service'
import { MusterService } from './overlay/muster.service'
import { TwitchChatService } from './chat/twitch-chat.service'
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
  /**
   * THE STACKS — the filing tree projects are sorted into. Reads the register
   * through the projects service and writes back through it, so the ownership
   * split survives: folders are this service's, records remain projects'.
   */
  readonly stacks: StacksService
  /**
   * VOLUMES — albums, EPs and compilations. Metadata only; it writes nothing to
   * disk. Reads and writes membership through the projects service, so the
   * ownership split survives.
   */
  readonly volumes: VolumesService
  /**
   * RELEASES. Owns a directory under the stacks wrapper, so it takes the stacks
   * service to resolve where that is rather than reading settings itself.
   */
  readonly releases: ReleasesService
  /**
   * CALENDAR — the dated register. Reads and writes its own collection and
   * nothing else's: an entry is the operator's statement of intent, not a
   * projection of a project or a release.
   */
  readonly calendar: CalendarService
  /** Shared by every overlay: one HTTP server, many pages. */
  readonly overlayServer: OverlayServer
  /**
   * Read-only chat ingest, shared like the server.
   *
   * Department infrastructure rather than one overlay's feature: THE CONCORD
   * counts votes out of it, and the rite's filed petitions and THE DOCKET's
   * queue are both specified against it.
   */
  readonly chat: TwitchChatService
  readonly rite: RiteService
  readonly timers: TimerService
  readonly nowPlaying: SpotifyService
  readonly dispatch: DispatchService
  readonly concord: ConcordService
  readonly muster: MusterService
}

export function createServiceContainer(): ServiceContainer {
  // Projects and the rite both read through the archive connection, so they are
  // the services here that take a collaborator rather than standing alone.
  const archive = new ArchiveService()
  // Hoisted out of the rite: the countdowns broadcast through the same stream,
  // so the server is department infrastructure rather than one feature's.
  const overlayServer = new OverlayServer()

  // Chat reads its channel from settings and reconnects when it changes, so it
  // takes the settings service rather than a string.
  const settings = new SettingsService()
  const chat = new TwitchChatService(settings)

  // Every other ARCHIVE service reads the register through the projects service
  // rather than opening a second repository on the same collection, so projects
  // is bound here rather than constructed inline below.
  const projects = new ProjectsService(archive)

  // The stacks read the register through the projects service, so the reverse
  // dependency — recomputing which folder each project sits in after a scan —
  // is handed back as a callback rather than made mutual. See `FilingResolver`.
  const stacks = new StacksService(archive, projects, settings)
  projects.setFilingResolver((records) => stacks.reconcileFiling(records))

  // Releases resolve their subject through both of the services above and their
  // directory through the stacks, which is why this is the one ARCHIVE service
  // constructed with three collaborators rather than one.
  const volumes = new VolumesService(archive, projects)
  const releases = new ReleasesService(archive, projects, volumes, stacks)

  /*
   * Hoisted out of the literal because THE MUSTER holds both.
   *
   * A finished roll is handed to the ring or to the chamber, so the muster
   * needs the two services rather than a channel — the hand-off is one call to
   * each, and routing it back out through IPC only to come in again would put
   * the renderer in the middle of a main-process concern.
   */
  const rite = new RiteService(archive, overlayServer)
  const concord = new ConcordService(archive, overlayServer, chat, settings)

  return {
    settings,
    archive,
    updates: new UpdateService(),
    telemetry: new TelemetryService(),
    projects,
    stacks,
    volumes,
    releases,
    calendar: new CalendarService(archive),
    overlayServer,
    chat,
    rite,
    timers: new TimerService(archive, overlayServer),
    nowPlaying: new SpotifyService(archive, overlayServer),
    dispatch: new DispatchService(),
    concord,
    muster: new MusterService(archive, overlayServer, chat, settings, rite, concord)
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
  container.dispatch.dispose()
  container.muster.dispose()
  // Before chat: the poll releases its claim on the way down, and disposing the
  // ingest first would leave that release writing to a cleared emitter.
  container.concord.dispose()
  container.chat.dispose()

  try {
    await container.archive.shutdown()
  } catch (error) {
    logger.error('Archive shutdown failed', error)
  }

  container.calendar.dispose()
  container.projects.dispose()
  container.telemetry.dispose()
  container.settings.clear()
  container.archive.clear()
  container.updates.clear()

  logger.info('Services disposed')
}
