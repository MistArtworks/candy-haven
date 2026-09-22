import { BrowserWindow, app, dialog, shell } from 'electron'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { APP_NAME } from '@shared/constants'
import { browseDirectory } from '@main/services/projects/scanner'
import { AUDIO_EXTENSIONS, MAX_AUDIO_BYTES } from '@shared/domain/auditorium'
import { CANVAS_EXTENSIONS, MAX_CANVAS_BYTES } from '@shared/domain/discography.constants'
import { bundleFilename } from '@shared/domain/settings-bundle'
import { SECTIONS } from '@shared/domain/navigation'
import type { RuntimeInfo } from '@shared/domain/system'
import { AppError, ErrorCode } from '@main/core/errors'
import { getLogFilePath, getLogger } from '@main/core/logger'
import { getPaths } from '@main/core/paths'
import type { ServiceContainer } from '@main/services/container'
import type { BootSequence } from '@main/app/boot-sequence'
import type { WindowManager } from '@main/app/window-manager'
import type { PopoutManager } from '@main/app/popout'
import type { VestibuleManager } from '@main/app/vestibule'
import { applyLaunchAtStartup } from '@main/app/startup'
import type { IpcRouter } from './router'

const logger = getLogger('ipc:handlers')

/** Only these schemes may be handed to the OS from renderer input. */
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:'])

export interface HandlerDependencies {
  router: IpcRouter
  services: ServiceContainer
  boot: BootSequence
  windows: WindowManager
  popouts: PopoutManager
  vestibule: VestibuleManager
  /**
   * Stands the application down to the tray with no window on screen.
   *
   * Owned by the entry point rather than by a manager, because it is a decision
   * about the *session* — it has to know whether there is a tray to retire to,
   * and it has to suppress the `window-all-closed` quit that closing the last
   * window would otherwise trigger.
   */
  retireToTray: () => void
  /** Called when the renderer reports the boot cinematic has finished. */
  onBootEntered: () => void
}

export function registerIpcHandlers(deps: HandlerDependencies): void {
  const { router, services, boot, windows, popouts, vestibule, retireToTray, onBootEntered } = deps
  const { settings, archive, updates } = services

  // ------------------------------------------------------------------ runtime

  router.handle('runtime:info', (): RuntimeInfo => {
    const paths = getPaths()
    return {
      appName: APP_NAME,
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      locale: app.getLocale(),
      isPackaged: app.isPackaged,
      isDevelopment: is.dev,
      paths: {
        userData: paths.userData,
        logs: getLogFilePath(),
        archiveData: paths.archiveData,
        resources: paths.resources
      }
    }
  })

  // ------------------------------------------------------------------- window

  router.handle('window:minimize', () => {
    windows.minimize()
  })
  router.handle('window:toggle-maximize', () => windows.toggleMaximize())
  router.handle('window:close', () => {
    // Not `close()`: the title bar's button is this application's own control,
    // and with a tray it retires the console rather than ending the session.
    // See WindowManager.requestClose for why Alt+F4 is treated differently.
    windows.requestClose()
  })
  router.handle('window:state', () => windows.getState())

  // --------------------------------------------------------------------- boot

  router.handle('boot:snapshot', () => boot.current)
  router.handle('boot:retry', () => boot.retry())
  router.handle('boot:enter', () => {
    onBootEntered()
  })

  // ------------------------------------------------------------------ archive

  router.handle('archive:status', () => archive.status)

  router.handle('archive:provision', async () => {
    await archive.provision()
    return archive.status
  })

  router.handle('archive:restart', async () => {
    const config = settings.snapshot.archive
    return archive.restart(config.port, config.executablePath)
  })

  // ----------------------------------------------------------------- settings

  router.handle('settings:get', () => settings.snapshot)

  router.handle('settings:update', async (patch) => {
    const next = await settings.update(patch)
    // A changed client id invalidates any existing link, so the service has to
    // hear about it now rather than at next launch.
    if (patch.integrations?.spotifyClientId !== undefined) {
      await services.nowPlaying.setClientId(next.integrations.spotifyClientId)
    }
    // Update preferences take effect immediately rather than at next launch.
    if (patch.updates) {
      updates.configure({ channel: next.updates.channel, autoDownload: next.updates.autoDownload })
    }
    /*
     * The login item is written through on the same call that stores the
     * setting, not at the next launch.
     *
     * Both fields are reconciled whenever either changes, because they describe
     * one registry entry between them: turning off "start minimised" has to
     * rewrite the existing entry's arguments, and only writing on
     * `launchAtStartup` would leave it starting hidden forever.
     */
    if (patch.system?.launchAtStartup !== undefined || patch.system?.startMinimised !== undefined) {
      applyLaunchAtStartup(next.system.launchAtStartup, next.system.startMinimised)
    }
    return next
  })

  router.handle('settings:reset', () => settings.reset())

  // ------------------------------------------------------------------ updates

  router.handle('update:status', () => updates.status)
  router.handle('update:check', () => updates.check())
  router.handle('update:download', () => updates.download())
  router.handle('update:install', () => {
    updates.install()
  })

  // ---------------------------------------------------------------- telemetry

  router.handle('telemetry:subscribe', () => services.telemetry.subscribe())
  router.handle('telemetry:unsubscribe', () => {
    services.telemetry.unsubscribe()
  })

  // ----------------------------------------------------------------- projects

  router.handle('projects:registry', (query) => services.projects.getRegistry(query ?? {}))
  router.handle('projects:get', ({ id }) => services.projects.get(id))
  router.handle('projects:patch', ({ id, patch }) => services.projects.patchProject(id, patch))

  /*
   * Creating a project is handled by the stacks service, not by projects.
   *
   * It needs a folder's path to provision into, and the folder tree belongs to
   * the stacks. Routing it there keeps the dependency one-directional — the
   * same reason `projects:file` is handled there too.
   */
  router.handle('projects:create', (draft) => services.stacks.createProject(draft))
  router.handle('projects:open', ({ id }) => services.projects.openInLive(id))

  /*
   * Roots come from settings rather than the renderer so a compromised renderer
   * cannot direct a recursive walk at an arbitrary directory.
   *
   * The filing root leads, followed by the satellite locations. It is filtered
   * out when unset rather than defaulted, so a scan before setup reports "no
   * roots configured" instead of walking somewhere arbitrary.
   */
  router.handle('projects:scan', (input) =>
    services.projects.runScan(settings.scanRoots, input?.force ?? false)
  )
  router.handle('projects:scan-cancel', () => services.projects.cancelScan())
  router.handle('projects:browse', ({ path }) => browseDirectory(path))
  router.handle('projects:file-many', ({ projectIds, folderIds, folderId }) =>
    services.stacks.fileMany(projectIds, folderIds, folderId)
  )
  // The projects service, not the stacks service: naming a final master is a
  // record edit now rather than a file move, so it belongs to the register.
  router.handle('projects:final-master', ({ id, path }) =>
    services.projects.setFinalMaster(id, path)
  )
  router.handle('projects:conform', () => services.projects.conformIcons())
  router.handle('projects:scan-state', () => services.projects.scan)

  router.handle('projects:note-add', ({ id, draft }) => services.projects.addNote(id, draft))
  router.handle('projects:note-update', ({ id, noteId, draft }) =>
    services.projects.updateNote(id, noteId, draft)
  )
  router.handle('projects:note-delete', ({ id, noteId }) =>
    services.projects.deleteNote(id, noteId)
  )

  router.handle('projects:forget', ({ id }) => services.projects.forget(id))
  /*
   * Binning and restoring both move a directory inside the wrapper, so they are
   * handled by the stacks service — the one that knows where the wrapper is.
   * Purging touches no wrapper path and stays with projects.
   */
  router.handle('projects:trash', ({ id }) => services.stacks.trashProject(id))
  router.handle('projects:restore', ({ id }) => services.stacks.restoreProject(id))
  router.handle('projects:purge', ({ id }) => services.projects.purge(id))
  router.handle('projects:thumbnail', ({ path, width }) =>
    services.projects.thumbnail(path, width ?? 480)
  )

  // THE STACKS. Filing moves the operator's project folders on disk, so the
  // service — not the renderer — owns every guard: no overwrite, no recursive
  // delete, nothing moved while a scan is walking the same tree.
  router.handle('projects:file', ({ id, folderId }) => services.stacks.fileProject(id, folderId))
  router.handle('stacks:tree', () => services.stacks.getTree())
  router.handle('stacks:setup-state', () => services.stacks.getSetupState())
  router.handle('stacks:setup', (draft) => services.stacks.setup(draft))
  router.handle('stacks:create', (draft) => services.stacks.createFolder(draft))
  router.handle('stacks:update', ({ id, patch }) => services.stacks.updateFolder(id, patch))
  router.handle('stacks:delete', ({ id }) => services.stacks.deleteFolder(id))
  router.handle('stacks:restore', ({ id }) => services.stacks.restoreFolder(id))
  router.handle('stacks:purge', ({ id }) => services.stacks.purgeFolder(id))

  // --------------------------------------------------------------------- tags

  router.handle('tags:list', () => services.tags.list())
  router.handle('tags:create', (draft) => services.tags.create(draft))
  router.handle('tags:update', ({ id, patch }) => services.tags.update(id, patch))
  router.handle('tags:delete', ({ id }) => services.tags.delete(id))

  // ------------------------------------------------------------------ artists

  router.handle('artists:list', () => services.artists.list())
  router.handle('artists:get', ({ id }) => services.artists.get(id))
  router.handle('artists:credits', ({ id }) => services.artists.credits(id))
  router.handle('artists:create', (draft) => services.artists.create(draft))
  router.handle('artists:update', ({ id, patch }) => services.artists.update(id, patch))
  router.handle('artists:set-picture', ({ id, sourcePath }) =>
    services.artists.setPicture(id, sourcePath)
  )
  router.handle('artists:delete', ({ id }) => services.artists.remove(id))

  // -------------------------------------------------------------- discography

  router.handle('discography:registry', () => services.discography.getRegistry())
  router.handle('discography:get', ({ id }) => services.discography.get(id))
  router.handle('discography:create', (draft) => services.discography.create(draft))
  router.handle('discography:update', ({ id, patch }) => services.discography.update(id, patch))
  router.handle('discography:delete', ({ id }) => services.discography.remove(id))
  router.handle('discography:set-asset', ({ id, asset, sourcePath }) =>
    services.discography.setAsset(id, asset, sourcePath)
  )
  router.handle('discography:track-add', ({ id, draft }) =>
    services.discography.addTrack(id, draft)
  )
  router.handle('discography:track-update', ({ id, trackId, patch }) =>
    services.discography.updateTrack(id, trackId, patch)
  )
  router.handle('discography:track-remove', ({ id, trackId }) =>
    services.discography.removeTrack(id, trackId)
  )
  router.handle('discography:track-reorder', ({ id, trackIds }) =>
    services.discography.reorderTracks(id, trackIds)
  )
  router.handle('discography:adopt', ({ id }) => services.discography.adopt(id))
  router.handle('discography:publish', ({ id }) => services.discography.publish(id))
  router.handle('discography:track-set-master', ({ id, trackId, path }) =>
    services.discography.setTrackMaster(id, trackId, path)
  )

  /*
   * THE SEEDER — temporary. Delete this block with the feature.
   *
   * `seed:run` is the only channel that carries credentials, and it carries
   * them one way. Nothing here returns one.
   */
  router.handle('seed:state', () => services.seed.getState())
  router.handle('seed:load-env', async () => {
    const window = windows.mainWindow
    const options = {
      title: 'Choose the seeder environment file',
      properties: ['openFile'] as string[],
      filters: [
        { name: 'Environment files', extensions: ['seed', 'env', 'txt', 'local'] },
        { name: 'All files', extensions: ['*'] }
      ]
    }

    // `showOpenDialog` hides dotfiles behind the platform's own toggle, and
    // `.env.seed` is a dotfile — so the dialog is told to show them rather
    // than leaving the operator unable to find the file they came for.
    options.properties.push('showHiddenFiles')

    const result = window
      ? await dialog.showOpenDialog(window, { ...options, properties: options.properties as never })
      : await dialog.showOpenDialog({ ...options, properties: options.properties as never })

    if (result.canceled) return null
    const path = result.filePaths[0]
    return path ? services.seed.loadEnv(path) : null
  })
  router.handle('seed:run', (credentials) => services.seed.run(credentials))
  router.handle('seed:decide', ({ key, choice }) => services.seed.decide(key, choice))
  router.handle('seed:include', ({ key, include }) => services.seed.setIncluded(key, include))
  router.handle('seed:apply', () => services.seed.apply())
  router.handle('seed:reset', () => services.seed.reset())
  router.handle('seed:abandon', () => services.seed.abandon())
  router.handle('seed:undo', () => services.seed.undo())
  router.handle('seed:accept', () => services.seed.acceptRun())

  // --------------------------------------------------------------------- rite

  router.handle('rite:state', () => services.rite.current)
  router.handle('rite:petition-add', (draft) => services.rite.addPetition(draft))
  router.handle('rite:petition-remove', ({ id }) => services.rite.removePetition(id))
  router.handle('rite:petition-weight', ({ id, weight }) =>
    services.rite.setPetitionWeight(id, weight)
  )
  router.handle('rite:petitions-clear', () => services.rite.clearPetitions())
  router.handle('rite:simulate', ({ count }) => services.rite.simulate(count))
  router.handle('rite:config', (patch) => services.rite.updateConfig(patch))
  router.handle('rite:spin', () => services.rite.spin())
  router.handle('rite:reset', () => services.rite.reset())
  router.handle('rite:history-clear', () => services.rite.clearHistory())

  // ----------------------------------------------------------------- concord

  router.handle('concord:state', () => services.concord.current)
  router.handle('concord:option-add', (draft) => services.concord.addOption(draft))
  router.handle('concord:option-remove', ({ id }) => services.concord.removeOption(id))
  router.handle('concord:ballot', ({ labels }) => services.concord.setBallot(labels))
  router.handle('concord:ballot-clear', () => services.concord.clearBallot())
  router.handle('concord:config', (patch) => services.concord.updateConfig(patch))
  router.handle('concord:open', () => services.concord.open())
  router.handle('concord:close', () => services.concord.close())
  router.handle('concord:reset', () => services.concord.reset())
  router.handle('concord:history-clear', () => services.concord.clearHistory())

  /*
   * Synthetic votes. The service refuses unless test mode is on.
   *
   * Declared in the contract like every other channel rather than omitted from
   * packaged builds, so a rejection arrives as a structured error the console can
   * explain instead of an unknown-channel failure that would look like a bug in
   * the bridge.
   */
  router.handle('concord:simulate', ({ count, changeVotes }) =>
    services.concord.simulate(count, { changeVotes })
  )

  // -------------------------------------------------------------------- chat

  router.handle('chat:status', () => services.chat.status)
  router.handle('chat:reconnect', () => services.chat.reconnect())

  // -------------------------------------------------------------------- timers

  router.handle('timer:all', () => services.timers.all)
  router.handle('timer:start', ({ id }) => services.timers.start(id))
  router.handle('timer:pause', ({ id }) => services.timers.pause(id))
  router.handle('timer:toggle', ({ id }) => services.timers.toggle(id))
  router.handle('timer:reset', ({ id }) => services.timers.reset(id))
  router.handle('timer:restart', ({ id }) => services.timers.restart(id))
  router.handle('timer:extend', ({ id, deltaMs }) => services.timers.extend(id, deltaMs))
  router.handle('timer:config', ({ id, patch }) => services.timers.configure(id, patch))

  // -------------------------------------------------------------- now playing

  router.handle('nowplaying:subscribe', () => services.nowPlaying.subscribe())
  router.handle('nowplaying:unsubscribe', () => {
    services.nowPlaying.unsubscribe()
  })
  router.handle('nowplaying:state', () => services.nowPlaying.current)
  router.handle('nowplaying:source-config', ({ id, patch }) =>
    services.nowPlaying.configureSource(id, patch)
  )
  router.handle('nowplaying:source-add', (draft) => services.nowPlaying.addSource(draft))
  router.handle('nowplaying:source-rename', ({ id, name, note }) =>
    services.nowPlaying.renameSource(id, name, note)
  )
  router.handle('nowplaying:source-remove', ({ id }) => services.nowPlaying.removeSource(id))
  router.handle('nowplaying:poll', ({ seconds }) => services.nowPlaying.setPollSeconds(seconds))
  router.handle('nowplaying:link', () => services.nowPlaying.link())
  router.handle('nowplaying:unlink', () => services.nowPlaying.unlink())
  router.handle('nowplaying:setup', () => services.nowPlaying.setup)

  // ------------------------------------------------------------------ dispatch

  router.handle('update:arrival', () => services.updates.notes.arrival())
  router.handle('update:acknowledge', () => services.updates.notes.acknowledge())

  // ---------------------------------------------------------------- catechism

  router.handle('guide:orientation', () => services.orientation.orientation())
  router.handle('guide:acknowledge', () => services.orientation.acknowledge())
  router.handle('guide:reset', () => services.orientation.reset())

  router.handle('dispatch:state', () => services.dispatch.current)
  router.handle('dispatch:setup', () => services.dispatch.setup)
  router.handle('dispatch:configure', ({ source }) => services.dispatch.configure(source))
  router.handle('dispatch:sign-in', ({ email, password }) =>
    services.dispatch.signIn(email, password)
  )
  router.handle('dispatch:sign-out', () => services.dispatch.signOut())
  router.handle('dispatch:file', (draft) => services.dispatch.file(draft))
  router.handle('dispatch:comment', (draft) => services.dispatch.comment(draft))
  router.handle('dispatch:rule', (ruling) => services.dispatch.rule(ruling))
  router.handle('dispatch:seen', ({ itemId, author }) => services.dispatch.markSeen(itemId, author))
  router.handle('dispatch:withdraw', ({ id }) => services.dispatch.withdraw(id))

  // -------------------------------------------------------------- the muster

  router.handle('muster:state', () => services.muster.current)
  router.handle('muster:open', ({ prompt }) => services.muster.open(prompt))
  router.handle('muster:close', () => services.muster.close())
  router.handle('muster:reset', () => services.muster.reset())
  router.handle('muster:simulate', ({ count, oneCitizen }) =>
    services.muster.simulate(count, { oneCitizen })
  )
  router.handle('muster:config', (patch) => services.muster.updateConfig(patch))
  router.handle('muster:add', (draft) => services.muster.add(draft))
  router.handle('muster:remove', ({ id }) => services.muster.remove(id))
  router.handle('muster:handoff', (request) => services.muster.handoff(request))

  router.handle('overlay:info', () => services.overlayServer.info)
  // The port comes from settings rather than the renderer, for the same reason
  // the scan roots do: a compromised renderer should not choose what we bind.
  router.handle('overlay:restart', async () => {
    await services.overlayServer.stop()
    return services.overlayServer.start(settings.snapshot.workspace.overlayPort)
  })

  // -------------------------------------------------------------------- shell

  // ----------------------------------------------------------------- calendar

  router.handle('calendar:state', () => services.calendar.snapshot())
  router.handle('calendar:create', (draft) => services.calendar.create(draft))
  router.handle('calendar:patch', ({ id, patch }) => services.calendar.patch(id, patch))
  router.handle('calendar:delete', async ({ id }) => {
    await services.calendar.remove(id)
  })

  /**
   * Hands a release's canvas to the sheet so it can be watched.
   *
   * Checked rather than trusted for the reason `auditorium:read` states: by the
   * time the path arrives here it is a renderer-supplied string, and without
   * these three refusals the channel would read any file on the disk into the
   * renderer for anything that could reach the bridge. That the app copied this
   * particular file into its own media folder does not change what the channel
   * would do if asked for something else.
   */
  router.handle('discography:canvas', async ({ path }) => {
    const extension = extname(path).slice(1).toLowerCase()

    if (!CANVAS_EXTENSIONS.includes(extension as (typeof CANVAS_EXTENSIONS)[number])) {
      throw new AppError(`${extension ? `.${extension}` : 'That file'} is not a canvas format.`, {
        code: ErrorCode.Validation,
        hint: `Supported: ${CANVAS_EXTENSIONS.map((value) => `.${value}`).join(', ')}`,
        recoverable: false
      })
    }

    const info = await stat(path).catch(() => null)
    if (!info?.isFile()) {
      throw new AppError('That canvas is no longer where it was.', {
        code: ErrorCode.NotFound,
        recoverable: false
      })
    }

    if (info.size > MAX_CANVAS_BYTES) {
      throw new AppError('That canvas is too large to play here.', {
        code: ErrorCode.Validation,
        hint: `The ceiling is ${Math.round(MAX_CANVAS_BYTES / 1024 / 1024)} MB; this is ${Math.round(
          info.size / 1024 / 1024
        )} MB.`,
        recoverable: false
      })
    }

    const contents = await readFile(path)

    return {
      path,
      extension,
      size: info.size,
      // A copy backed by its own ArrayBuffer, for the reason `auditorium:read`
      // spells out: Node hands out Buffers that are views into a shared pool,
      // and structured-cloning one sends the whole pool across the bridge.
      bytes: new Uint8Array(
        contents.buffer.slice(contents.byteOffset, contents.byteOffset + contents.byteLength)
      )
    }
  })

  // --------------------------------------------------------------- auditorium

  /**
   * Hands one audio file to the listening room.
   *
   * The path is checked rather than trusted even though it comes from a native
   * dialog: this is a renderer-supplied string by the time it arrives here, and
   * the channel would otherwise read any file on the disk into the renderer for
   * anything that could reach the bridge. Extension and size are both refused
   * with a plain reason, because "nothing happened" is the worst outcome for an
   * operator who just chose a file.
   */
  router.handle('auditorium:read', async ({ path }) => {
    const extension = extname(path).slice(1).toLowerCase()

    if (!AUDIO_EXTENSIONS.includes(extension as (typeof AUDIO_EXTENSIONS)[number])) {
      throw new AppError(`${extension ? `.${extension}` : 'That file'} is not an audio format.`, {
        code: ErrorCode.Validation,
        hint: `Supported: ${AUDIO_EXTENSIONS.map((value) => `.${value}`).join(', ')}`,
        recoverable: false
      })
    }

    const info = await stat(path).catch(() => null)
    if (!info?.isFile()) {
      throw new AppError('That file is no longer where it was.', {
        code: ErrorCode.NotFound,
        recoverable: false
      })
    }

    if (info.size > MAX_AUDIO_BYTES) {
      throw new AppError('That file is too large for the listening room.', {
        code: ErrorCode.Validation,
        hint: `The ceiling is ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)} MB; this is ${Math.round(
          info.size / 1024 / 1024
        )} MB.`,
        recoverable: false
      })
    }

    const contents = await readFile(path)

    return {
      path,
      name: basename(path),
      extension,
      size: info.size,
      modifiedAt: info.mtimeMs,
      // A copy backed by its own ArrayBuffer. Node hands out Buffers that are
      // views into a shared pool, and structured-cloning one of those across
      // the bridge sends the whole pool — megabytes of unrelated memory, and a
      // renderer-side view whose byteOffset nobody accounted for.
      bytes: new Uint8Array(
        contents.buffer.slice(contents.byteOffset, contents.byteOffset + contents.byteLength)
      )
    }
  })

  router.handle('auditorium:popout', ({ file, at, playing }) => {
    popouts.openAuditorium(file, at, playing)
  })

  router.handle('auditorium:announce', ({ file }) => {
    // Broadcast, including back to the sender. The renderer compares against
    // what it already has, so the echo costs nothing and the alternative —
    // tracking which window asked — is state this does not need to hold.
    router.broadcast('auditorium:file', { path: file })
  })

  router.handle('auditorium:popout-pin', ({ pinned }) => {
    popouts.setAlwaysOnTop(pinned)
    // The settled state is read back rather than echoed, so a window manager
    // that refused the request is reported honestly to the control.
    return popouts.isAlwaysOnTop()
  })

  // ------------------------------------------------------------ popout chrome

  router.handle('popout:minimize', (_input, event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  router.handle('popout:close', (_input, event) => {
    // A real close. The tray policy belongs to the console's window and would
    // be actively wrong here: hiding a detached player leaves it playing with
    // nothing to click.
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  // --------------------------------------------------------- vestibule chrome

  router.handle('vestibule:minimize', (_input, event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  router.handle('vestibule:close', (_input, event) => {
    /*
     * A real close, and it ends the session.
     *
     * Closing the vestibule is the operator declining both of the things it
     * offered, so there is nothing left to be resident for. It is also the only
     * window at that point, so `window-all-closed` reaches `app.quit()` on its
     * own and this needs no help — the flag that suppresses that quit is set
     * only on the retire path.
     */
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  router.handle('vestibule:console', async ({ route }) => {
    /*
     * The destination is checked against the registry, not taken on trust.
     *
     * It arrives from a renderer and ends up in the URL the console loads, so
     * an unrecognised path is dropped rather than forwarded — the console then
     * opens where it always does. `implemented` is part of the test because a
     * reserved section is a page that says "not commissioned yet", which is a
     * pointless place to open an application at.
     */
    const target = route
      ? (SECTIONS.find((section) => section.path === route && section.implemented)?.path ?? null)
      : null

    if (route && !target) logger.warn(`Ignored an unknown vestibule destination: ${route}`)

    /*
     * Console first, vestibule second. Not interchangeable.
     *
     * Destroying the vestibule while it is the only window takes the count to
     * zero, and `window-all-closed` ends the session — so reversing these two
     * lines quits the application on the way to opening it.
     */
    await windows.create({ entered: boot.current.phase === 'ready', route: target })
    vestibule.close()
  })

  router.handle('vestibule:handoff', async ({ id }) => {
    // The set opens before the window goes, so a failure to launch Ableton
    // surfaces in the pane that asked rather than against a closing window.
    await services.projects.openInLive(id)
    retireToTray()
  })

  router.handle('shell:open-external', async ({ url }) => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new AppError('That link is not a valid URL.', {
        code: ErrorCode.Validation,
        recoverable: false
      })
    }

    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
      // Prevents a compromised renderer from launching arbitrary handlers.
      logger.warn(`Blocked external open for disallowed protocol: ${parsed.protocol}`)
      throw new AppError('That link type cannot be opened.', {
        code: ErrorCode.PermissionDenied,
        recoverable: false
      })
    }

    await shell.openExternal(parsed.toString())
  })

  /**
   * Selects the item in the operator's file manager.
   *
   * `showItemInFolder`, not `openPath` — which is what this used to call, and
   * meant "reveal" silently *opened* whatever was passed to it. Harmless while
   * the only caller passed directories; wrong the moment anything passed a
   * file, which the register now does from several places.
   */
  router.handle('shell:reveal', ({ path }) => {
    shell.showItemInFolder(path)
  })

  /**
   * Opens a file with whatever the OS has registered for it.
   *
   * Distinct from `shell:reveal`, which selects the file in Explorer. Opening
   * an `.als` hands it to whichever Live version the operator has associated
   * with the extension, which is a better answer than this app guessing.
   */
  router.handle('shell:open-path', async ({ path }) => {
    const failure = await shell.openPath(path)
    if (failure) {
      throw new AppError('That file could not be opened.', {
        code: ErrorCode.Unknown,
        hint: failure,
        recoverable: true
      })
    }
  })

  /*
   * Where the export goes, and what an import reads.
   *
   * Cancelling is not an error at either end: the operator opened a dialog and
   * changed their mind, which is an ordinary thing to do. Export reports a null
   * path, import reports null outright, and the console says nothing either
   * way rather than raising a notice about a thing that did not happen.
   */
  router.handle('settings:export', async () => {
    const window = windows.mainWindow
    const options = {
      title: 'Export settings',
      defaultPath: bundleFilename(app.getVersion(), new Date()),
      filters: [{ name: 'Candy Haven settings', extensions: ['zip'] }]
    }

    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options)

    if (result.canceled || !result.filePath) return { path: null, entries: [] }
    return services.settings.exportTo(result.filePath)
  })

  router.handle('settings:import', async () => {
    const window = windows.mainWindow
    const options = {
      title: 'Import settings',
      properties: ['openFile'] as const,
      filters: [{ name: 'Candy Haven settings', extensions: ['zip'] }]
    }

    const result = window
      ? await dialog.showOpenDialog(window, { ...options, properties: [...options.properties] })
      : await dialog.showOpenDialog({ ...options, properties: [...options.properties] })

    const path = result.canceled ? null : (result.filePaths[0] ?? null)
    if (!path) return null

    return services.settings.importFrom(path)
  })

  router.handle('dialog:select-directory', async (input) => {
    const window = windows.mainWindow
    const options = {
      title: input?.title ?? 'Select a directory',
      properties: ['openDirectory', 'createDirectory'] as const
    }

    const result = window
      ? await dialog.showOpenDialog(window, { ...options, properties: [...options.properties] })
      : await dialog.showOpenDialog({ ...options, properties: [...options.properties] })

    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  /**
   * Writes a graded image where the operator points.
   *
   * The renderer rasterises, because the canvas is the only thing in the app
   * that can apply a grade; main owns the dialog and the write. Same split as
   * `settings:export` just above.
   */
  router.handle('darkroom:save', async ({ data, suggestedName }) => {
    const window = windows.mainWindow
    const options = {
      title: 'Export graded image',
      defaultPath: suggestedName,
      filters: [{ name: 'PNG image', extensions: ['png'] }]
    }

    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options)

    if (result.canceled || !result.filePath) return null

    await writeFile(result.filePath, data)
    logger.info(`Exported graded image to ${result.filePath}`)
    return result.filePath
  })

  router.handle('dialog:select-file', async (input) => {
    const window = windows.mainWindow
    const options = {
      title: input?.title ?? 'Select a file',
      properties: ['openFile'] as const,
      filters: input?.filters ?? []
    }

    const result = window
      ? await dialog.showOpenDialog(window, { ...options, properties: [...options.properties] })
      : await dialog.showOpenDialog({ ...options, properties: [...options.properties] })

    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  logger.info('IPC handlers registered')
}

/** Bridges main-process service events onto the renderer event channels. */
export function registerEventBridges(deps: {
  router: IpcRouter
  services: ServiceContainer
  boot: BootSequence
  windows: WindowManager
}): void {
  const { router, services, boot, windows } = deps

  boot.on('progress', (snapshot) => router.broadcast('boot:progress', snapshot))
  services.archive.on('status', (status) => router.broadcast('archive:status', status))
  services.updates.on('status', (status) => router.broadcast('update:status', status))
  services.telemetry.on('sample', (state) => router.broadcast('telemetry:sample', state))
  services.projects.on('scan', (state) => router.broadcast('projects:scan', state))
  services.rite.on('state', (state) => router.broadcast('rite:state', state))
  services.concord.on('state', (state) => router.broadcast('concord:state', state))
  services.chat.on('status', (status) => router.broadcast('chat:status', status))
  services.timers.on('state', (state) => router.broadcast('timer:state', state))
  services.nowPlaying.on('state', (state) => router.broadcast('nowplaying:state', state))
  services.dispatch.on('state', (state) => router.broadcast('dispatch:state', state))
  services.muster.on('state', (state) => router.broadcast('muster:state', state))
  services.overlayServer.on('info', (info) => router.broadcast('overlay:info', info))
  services.calendar.on('changed', (state) => router.broadcast('calendar:state', state))

  // THE SEEDER · temporary. Delete with the feature.
  services.seed.on('progress', (progress) => router.broadcast('seed:progress', progress))
  services.seed.on('log', (batch) => router.broadcast('seed:log', batch))

  windows.subscribe((state) => router.broadcast('window:state', state))
}
