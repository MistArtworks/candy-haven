import { contextBridge, ipcRenderer, webFrame, type IpcRendererEvent } from 'electron'
import type { CandyHavenApi, Unsubscribe } from '@shared/ipc/api'
import {
  EVENT_CHANNELS,
  INVOKE_CHANNELS,
  type EventChannel,
  type EventPayload,
  type InvokeChannel,
  type InvokeInput,
  type InvokeOutput,
  type IpcResponse,
  type SerializedError
} from '@shared/ipc/contract'

/**
 * Preload bridge.
 *
 * This is the only module permitted to touch `ipcRenderer`. It exposes a narrow,
 * typed surface on `window.candy` and refuses any channel that is not declared
 * in the shared contract, so a compromised renderer cannot reach arbitrary IPC.
 */

const invokeAllowList = new Set<string>(INVOKE_CHANNELS)
const eventAllowList = new Set<string>(EVENT_CHANNELS)

/** Rehydrates a serialized main-process error into a real Error for the renderer. */
class BridgeError extends Error {
  readonly code: string
  readonly hint: string | null
  readonly recoverable: boolean

  constructor(error: SerializedError) {
    super(error.message)
    this.name = error.name || 'BridgeError'
    this.code = error.code
    this.hint = error.hint
    this.recoverable = error.recoverable
    if (error.stack) this.stack = error.stack
  }
}

async function invoke<C extends InvokeChannel>(
  channel: C,
  input?: InvokeInput<C>
): Promise<InvokeOutput<C>> {
  if (!invokeAllowList.has(channel)) {
    throw new Error(`Blocked IPC channel: ${channel}`)
  }

  const response = (await ipcRenderer.invoke(channel, input)) as IpcResponse<InvokeOutput<C>>

  if (!response || typeof response !== 'object' || !('ok' in response)) {
    throw new Error(`Malformed IPC response for "${channel}".`)
  }
  if (!response.ok) throw new BridgeError(response.error)

  return response.data
}

function subscribe<C extends EventChannel>(
  channel: C,
  listener: (payload: EventPayload<C>) => void
): Unsubscribe {
  if (!eventAllowList.has(channel)) {
    throw new Error(`Blocked IPC event channel: ${channel}`)
  }

  const handler = (_event: IpcRendererEvent, payload: EventPayload<C>): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api: CandyHavenApi = {
  runtime: {
    info: () => invoke('runtime:info')
  },
  window: {
    minimize: () => invoke('window:minimize'),
    toggleMaximize: () => invoke('window:toggle-maximize'),
    close: () => invoke('window:close'),
    state: () => invoke('window:state'),
    /*
     * Set here rather than over IPC.
     *
     * `webFrame` is a renderer-side API and preload runs in the renderer, so
     * this takes effect on the frame directly — no round trip, and no chance of
     * the window being drawn at one scale while a reply is in flight. It is the
     * one thing on this bridge that does not go through a channel, which is why
     * it is worth saying so.
     */
    setZoom: (factor: number) => {
      webFrame.setZoomFactor(factor)
    },
    onState: (listener) => subscribe('window:state', listener)
  },
  boot: {
    snapshot: () => invoke('boot:snapshot'),
    retry: () => invoke('boot:retry'),
    enter: () => invoke('boot:enter'),
    onProgress: (listener) => subscribe('boot:progress', listener)
  },
  archive: {
    status: () => invoke('archive:status'),
    provision: () => invoke('archive:provision'),
    restart: () => invoke('archive:restart'),
    onStatus: (listener) => subscribe('archive:status', listener)
  },
  settings: {
    get: () => invoke('settings:get'),
    update: (patch) => invoke('settings:update', patch),
    reset: () => invoke('settings:reset')
  },
  updates: {
    status: () => invoke('update:status'),
    check: () => invoke('update:check'),
    download: () => invoke('update:download'),
    install: () => invoke('update:install'),
    onStatus: (listener) => subscribe('update:status', listener)
  },
  telemetry: {
    subscribe: () => invoke('telemetry:subscribe'),
    unsubscribe: () => invoke('telemetry:unsubscribe'),
    onSample: (listener) => subscribe('telemetry:sample', listener)
  },
  projects: {
    registry: (query) => invoke('projects:registry', query),
    get: (id) => invoke('projects:get', { id }),
    patch: (id, patch) => invoke('projects:patch', { id, patch }),
    scan: (force) => invoke('projects:scan', force ? { force } : undefined),
    cancelScan: () => invoke('projects:scan-cancel'),
    scanState: () => invoke('projects:scan-state'),
    addNote: (id, draft) => invoke('projects:note-add', { id, draft }),
    updateNote: (id, noteId, draft) => invoke('projects:note-update', { id, noteId, draft }),
    deleteNote: (id, noteId) => invoke('projects:note-delete', { id, noteId }),
    create: (draft) => invoke('projects:create', draft),
    open: (id) => invoke('projects:open', { id }),
    forget: (id) => invoke('projects:forget', { id }),
    trash: (id) => invoke('projects:trash', { id }),
    restore: (id) => invoke('projects:restore', { id }),
    purge: (id) => invoke('projects:purge', { id }),
    thumbnail: (path, width) => invoke('projects:thumbnail', { path, width }),
    file: (id, folderId) => invoke('projects:file', { id, folderId }),
    onScan: (listener) => subscribe('projects:scan', listener)
  },
  stacks: {
    tree: () => invoke('stacks:tree'),
    setupState: () => invoke('stacks:setup-state'),
    setup: (draft) => invoke('stacks:setup', draft),
    create: (draft) => invoke('stacks:create', draft),
    update: (id, patch) => invoke('stacks:update', { id, patch }),
    remove: (id) => invoke('stacks:delete', { id }),
    restore: (id) => invoke('stacks:restore', { id }),
    purge: (id) => invoke('stacks:purge', { id })
  },
  volumes: {
    list: () => invoke('volumes:list'),
    get: (id) => invoke('volumes:get', { id }),
    create: (draft) => invoke('volumes:create', draft),
    update: (id, patch) => invoke('volumes:update', { id, patch }),
    remove: (id) => invoke('volumes:delete', { id }),
    reorder: (id, projectIds) => invoke('volumes:reorder', { id, projectIds })
  },
  releases: {
    list: () => invoke('releases:list'),
    get: (id) => invoke('releases:get', { id }),
    create: (draft) => invoke('releases:create', draft),
    update: (id, patch) => invoke('releases:update', { id, patch }),
    attach: (id, kind, sourcePath) => invoke('releases:attach', { id, kind, sourcePath }),
    remove: (id) => invoke('releases:delete', { id })
  },
  rite: {
    state: () => invoke('rite:state'),
    addPetition: (draft) => invoke('rite:petition-add', draft),
    removePetition: (id) => invoke('rite:petition-remove', { id }),
    setWeight: (id, weight) => invoke('rite:petition-weight', { id, weight }),
    clearPetitions: () => invoke('rite:petitions-clear'),
    configure: (patch) => invoke('rite:config', patch),
    spin: () => invoke('rite:spin'),
    reset: () => invoke('rite:reset'),
    clearHistory: () => invoke('rite:history-clear'),
    onState: (listener) => subscribe('rite:state', listener)
  },
  concord: {
    state: () => invoke('concord:state'),
    addOption: (draft) => invoke('concord:option-add', draft),
    removeOption: (id) => invoke('concord:option-remove', { id }),
    setBallot: (labels) => invoke('concord:ballot', { labels }),
    clearBallot: () => invoke('concord:ballot-clear'),
    configure: (patch) => invoke('concord:config', patch),
    open: () => invoke('concord:open'),
    close: () => invoke('concord:close'),
    reset: () => invoke('concord:reset'),
    clearHistory: () => invoke('concord:history-clear'),
    simulate: (count, changeVotes) => invoke('concord:simulate', { count, changeVotes }),
    onState: (listener) => subscribe('concord:state', listener)
  },
  chat: {
    status: () => invoke('chat:status'),
    reconnect: () => invoke('chat:reconnect'),
    onStatus: (listener) => subscribe('chat:status', listener)
  },
  timers: {
    all: () => invoke('timer:all'),
    start: (id) => invoke('timer:start', { id }),
    pause: (id) => invoke('timer:pause', { id }),
    toggle: (id) => invoke('timer:toggle', { id }),
    reset: (id) => invoke('timer:reset', { id }),
    restart: (id) => invoke('timer:restart', { id }),
    extend: (id, deltaMs) => invoke('timer:extend', { id, deltaMs }),
    configure: (id, patch) => invoke('timer:config', { id, patch }),
    onState: (listener) => subscribe('timer:state', listener)
  },
  nowPlaying: {
    subscribe: () => invoke('nowplaying:subscribe'),
    unsubscribe: () => invoke('nowplaying:unsubscribe'),
    state: () => invoke('nowplaying:state'),
    configure: (patch) => invoke('nowplaying:config', patch),
    link: () => invoke('nowplaying:link'),
    unlink: () => invoke('nowplaying:unlink'),
    setup: () => invoke('nowplaying:setup'),
    onState: (listener) => subscribe('nowplaying:state', listener)
  },
  overlay: {
    info: () => invoke('overlay:info'),
    restart: () => invoke('overlay:restart'),
    onInfo: (listener) => subscribe('overlay:info', listener)
  },
  shell: {
    openExternal: (url) => invoke('shell:open-external', { url }),
    reveal: (path) => invoke('shell:reveal', { path }),
    openPath: (path) => invoke('shell:open-path', { path }),
    selectDirectory: (title) => invoke('dialog:select-directory', title ? { title } : undefined),
    selectFile: (options) => invoke('dialog:select-file', options)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('candy', api)
} else {
  // Context isolation is enabled in all shipped configurations; this branch
  // exists only so a misconfigured build fails loudly rather than silently.
  throw new Error('Candy Haven requires context isolation to be enabled.')
}
