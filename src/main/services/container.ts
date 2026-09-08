import { SettingsService } from './settings/settings.service'
import { ArchiveService } from './archive/archive.service'
import { UpdateService } from './update/update.service'
import { TelemetryService } from './telemetry/telemetry.service'
import { ProjectsService } from './projects/projects.service'
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
}

export function createServiceContainer(): ServiceContainer {
  // Projects reads through the archive connection, so it is the one service
  // here that takes a collaborator rather than standing alone.
  const archive = new ArchiveService()

  return {
    settings: new SettingsService(),
    archive,
    updates: new UpdateService(),
    telemetry: new TelemetryService(),
    projects: new ProjectsService(archive)
  }
}

/**
 * Tears services down in reverse dependency order. Every step is isolated so a
 * failure in one service cannot prevent the others from releasing resources —
 * important because this runs on the quit path.
 */
export async function disposeServiceContainer(container: ServiceContainer): Promise<void> {
  logger.info('Disposing services')

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
