import { z } from 'zod'
import { BootSnapshotSchema } from '../domain/boot'
import { ArchiveStatusSchema } from '../domain/archive'
import { SettingsPatchSchema, SettingsSchema } from '../domain/settings'
import { RuntimeInfoSchema, WindowStateSchema } from '../domain/system'
import { UpdateStatusSchema } from '../domain/update'
import { TelemetryStateSchema } from '../domain/telemetry'
import {
  NowPlayingSourceConfigSchema,
  NowPlayingSourceDraftSchema,
  NowPlayingSourceRenameSchema,
  NowPlayingStateSchema,
  SpotifySetupSchema
} from '../domain/nowplaying'
import {
  TimerConfigPatchSchema,
  TimerIdSchema,
  TimerSetSchema,
  TimerStateSchema
} from '../domain/timer'
import {
  OverlayServerInfoSchema,
  PetitionDraftSchema,
  RiteConfigPatchSchema,
  RiteStateSchema
} from '../domain/rite'
import {
  ConcordBallotSchema,
  ConcordConfigPatchSchema,
  ConcordOptionDraftSchema,
  ConcordStateSchema
} from '../domain/concord'
import { ChatStatusSchema } from '../domain/chat'
import {
  DispatchCommentDraftSchema,
  DispatchDraftSchema,
  DispatchRulingSchema,
  DispatchSeenMarkSchema,
  DispatchSetupSchema,
  DispatchStateSchema
} from '../domain/dispatch'
import {
  NoteDraftSchema,
  ProjectDraftSchema,
  ProjectPatchSchema,
  ProjectQuerySchema,
  ProjectRecordSchema,
  ProjectRegistrySchema,
  ScanStateSchema
} from '../domain/projects'
import {
  ArchiveSetupDraftSchema,
  ArchiveSetupStateSchema,
  FolderDraftSchema,
  FolderPatchSchema,
  StacksTreeSchema
} from '../domain/stacks'
import {
  ArchiveVolumeSchema,
  VolumeDraftSchema,
  VolumePatchSchema,
  VolumeSummarySchema
} from '../domain/volumes'
import {
  ArchiveReleaseSchema,
  DeliverableAttachSchema,
  ReleaseDraftSchema,
  ReleasePatchSchema,
  ReleaseSummarySchema
} from '../domain/releases'

/**
 * The IPC contract is declared once, here, and consumed by:
 *   - the main-process router, which validates inputs and outputs at runtime
 *   - the preload bridge, which rejects any channel not declared below
 *   - the renderer, which derives its call signatures from these schemas
 *
 * Adding a channel therefore requires exactly one edit, and every consumer
 * stays type-checked against it.
 */

/** Renderer -> main request/response channels. */
export const IPC_INVOKE = {
  'runtime:info': { input: z.void(), output: RuntimeInfoSchema },

  'window:minimize': { input: z.void(), output: z.void() },
  'window:toggle-maximize': { input: z.void(), output: WindowStateSchema },
  'window:close': { input: z.void(), output: z.void() },
  'window:state': { input: z.void(), output: WindowStateSchema },

  'boot:snapshot': { input: z.void(), output: BootSnapshotSchema },
  'boot:retry': { input: z.void(), output: BootSnapshotSchema },
  /** Renderer signals the boot cinematic has finished; main reveals the window. */
  'boot:enter': { input: z.void(), output: z.void() },

  'archive:status': { input: z.void(), output: ArchiveStatusSchema },
  'archive:provision': { input: z.void(), output: ArchiveStatusSchema },
  'archive:restart': { input: z.void(), output: ArchiveStatusSchema },

  'settings:get': { input: z.void(), output: SettingsSchema },
  'settings:update': { input: SettingsPatchSchema, output: SettingsSchema },
  'settings:reset': { input: z.void(), output: SettingsSchema },

  'update:status': { input: z.void(), output: UpdateStatusSchema },
  'update:check': { input: z.void(), output: UpdateStatusSchema },
  'update:download': { input: z.void(), output: UpdateStatusSchema },
  'update:install': { input: z.void(), output: z.void() },

  /** Reference-counted: sampling runs only while a view is watching. */
  'telemetry:subscribe': { input: z.void(), output: TelemetryStateSchema },
  'telemetry:unsubscribe': { input: z.void(), output: z.void() },

  /**
   * Project registry (ARCHIVE section). Reads return summaries; the dossier
   * fetches one full record on demand, so listing hundreds of projects does not
   * move every track name and sample path across the boundary.
   */
  'projects:registry': { input: ProjectQuerySchema.optional(), output: ProjectRegistrySchema },
  'projects:get': { input: z.object({ id: z.string() }), output: ProjectRecordSchema },
  'projects:patch': {
    input: z.object({ id: z.string(), patch: ProjectPatchSchema }),
    output: ProjectRecordSchema
  },
  /**
   * Provisions a new project: creates the directory, copies the template set
   * under the project's name, and makes the scaffold folders inside it.
   *
   * Refused unless the department is set up. Any folder in the tree may hold a
   * project, including a genre at the top level.
   */
  'projects:create': { input: ProjectDraftSchema, output: ProjectRecordSchema },
  /** Opens the project's primary set in whatever handles `.als`. */
  'projects:open': { input: z.object({ id: z.string() }), output: z.void() },
  /** `force` re-reads every set instead of reusing unchanged analyses. */
  'projects:scan': {
    input: z.object({ force: z.boolean().optional() }).optional(),
    output: ScanStateSchema
  },
  'projects:scan-cancel': { input: z.void(), output: ScanStateSchema },
  'projects:scan-state': { input: z.void(), output: ScanStateSchema },
  'projects:note-add': {
    input: z.object({ id: z.string(), draft: NoteDraftSchema }),
    output: ProjectRecordSchema
  },
  'projects:note-update': {
    input: z.object({ id: z.string(), noteId: z.string(), draft: NoteDraftSchema }),
    output: ProjectRecordSchema
  },
  'projects:note-delete': {
    input: z.object({ id: z.string(), noteId: z.string() }),
    output: ProjectRecordSchema
  },
  /** Drops the record and leaves every file exactly where it is. */
  'projects:forget': { input: z.object({ id: z.string() }), output: z.void() },
  /**
   * Moves the project folder into the archive's own recycle bin.
   *
   * Reversible: the record is kept, complete, along with the path it came from,
   * and `projects:restore` puts it back. Nothing here reaches the operating
   * system's bin — see `projects:purge` for the step that does.
   */
  'projects:trash': { input: z.object({ id: z.string() }), output: ProjectRecordSchema },
  /** Puts a binned project back where it came from, and re-files it. */
  'projects:restore': { input: z.object({ id: z.string() }), output: ProjectRecordSchema },
  /**
   * Removes a binned project for good.
   *
   * Refused for anything not already in the bin, which is the safety property
   * worth stating: no single action takes a live project from the register to
   * gone. Even this sends the folder to the OS recycle bin rather than
   * unlinking it.
   */
  'projects:purge': { input: z.object({ id: z.string() }), output: z.void() },
  /** Decoded and downscaled in main: the renderer CSP forbids `file:` images. */
  'projects:thumbnail': {
    input: z.object({ path: z.string(), width: z.number().int().min(32).max(1024).optional() }),
    output: z.string().nullable()
  },
  /**
   * Moves a project's folder into a stacks folder, or back out of the tree.
   *
   * Returns the record rather than the tree: the caller almost always has a
   * dossier or a card on screen for this one project, and the tree is refetched
   * alongside it because the counts changed.
   */
  'projects:file': {
    input: z.object({ id: z.string(), folderId: z.string().nullable() }),
    output: ProjectRecordSchema
  },

  /**
   * THE STACKS (ARCHIVE section) — the filing tree.
   *
   * Every folder here is a real directory, so these channels move the
   * operator's files. Each mutation returns the whole rebuilt tree, as the
   * rite's and THE CONCORD's do: renaming one folder rewrites the path of every
   * descendant and re-parenting changes counts several levels away, so a
   * response carrying only the changed row would leave the page to re-derive
   * what the main process already knows.
   */
  'stacks:tree': { input: z.void(), output: StacksTreeSchema },
  /**
   * Whether the department can be used, and which gate is missing if not.
   *
   * Separate from `stacks:tree` because the setup gate asks it before there is
   * a tree to fetch — with no root configured, there is no wrapper to read
   * folders out of.
   */
  'stacks:setup-state': { input: z.void(), output: ArchiveSetupStateSchema },
  /** Saves the root and template, then creates the wrapper and RELEASES. */
  'stacks:setup': { input: ArchiveSetupDraftSchema, output: ArchiveSetupStateSchema },
  'stacks:create': { input: FolderDraftSchema, output: StacksTreeSchema },
  'stacks:update': {
    input: z.object({ id: z.string(), patch: FolderPatchSchema }),
    output: StacksTreeSchema
  },
  /**
   * Moves a folder into the recycle bin, with everything inside it.
   *
   * Reversible, and that is why it no longer needs the two-step `unfile`
   * confirmation it used to: nothing is destroyed, so an occupied folder is not
   * a hazard. Descendant folders and every project filed under them are trashed
   * alongside, and `stacks:restore` brings the whole subtree back.
   */
  'stacks:delete': { input: z.object({ id: z.string() }), output: StacksTreeSchema },
  /** Puts a binned folder and its whole subtree back where it came from. */
  'stacks:restore': { input: z.object({ id: z.string() }), output: StacksTreeSchema },
  /**
   * Removes a binned folder for good, with everything inside it.
   *
   * Refused unless already binned. Sends the directory to the *OS* recycle bin
   * rather than unlinking it, then drops every record underneath.
   */
  'stacks:purge': { input: z.object({ id: z.string() }), output: StacksTreeSchema },

  /**
   * VOLUMES (ARCHIVE section) — albums, EPs and compilations.
   *
   * Metadata only: no channel here touches the filesystem. Membership is
   * written through `projects:patch` on the *track*, not here, because the
   * project is what holds `volumeId` — see volumes.ts for why there is no
   * track list on the volume itself.
   */
  'volumes:list': { input: z.void(), output: z.array(VolumeSummarySchema) },
  'volumes:get': { input: z.object({ id: z.string() }), output: ArchiveVolumeSchema },
  'volumes:create': { input: VolumeDraftSchema, output: VolumeSummarySchema },
  'volumes:update': {
    input: z.object({ id: z.string(), patch: VolumePatchSchema }),
    output: VolumeSummarySchema
  },
  /**
   * Detaches every track first, dropping each one's category back to `single`.
   * Nothing on disk is touched — a volume never owned a directory.
   */
  'volumes:delete': { input: z.object({ id: z.string() }), output: z.void() },
  /** Reorders tracks within a volume; ids are given in their new order. */
  'volumes:reorder': {
    input: z.object({ id: z.string(), projectIds: z.array(z.string()) }),
    output: z.array(VolumeSummarySchema)
  },

  /**
   * RELEASES (ARCHIVE section).
   *
   * A release owns a real directory under `<wrapper>/RELEASES`, so `create`,
   * `update` (when it renames) and `delete` all move things on disk and follow
   * the same disk-first ordering the stacks use.
   */
  'releases:list': { input: z.void(), output: z.array(ReleaseSummarySchema) },
  'releases:get': { input: z.object({ id: z.string() }), output: ArchiveReleaseSchema },
  'releases:create': { input: ReleaseDraftSchema, output: ReleaseSummarySchema },
  'releases:update': {
    input: z.object({ id: z.string(), patch: ReleasePatchSchema }),
    output: ReleaseSummarySchema
  },
  /**
   * Copies a chosen file into the release folder and records both paths.
   * A null `sourcePath` detaches, leaving any existing copy on disk.
   */
  'releases:attach': { input: DeliverableAttachSchema, output: ArchiveReleaseSchema },
  /**
   * Drops the record. The directory is left on disk: it holds copies the
   * operator assembled deliberately, and this app does not delete those without
   * being asked plainly — which `projects:trash` is, and this is not.
   */
  'releases:delete': { input: z.object({ id: z.string() }), output: z.void() },

  /**
   * Selection rite (OBSERVATORY section). The winner is drawn in main and
   * travels inside the spin command, so the console and every browser source
   * animate toward one predetermined result rather than each rolling their own.
   */
  'rite:state': { input: z.void(), output: RiteStateSchema },
  'rite:petition-add': { input: PetitionDraftSchema, output: RiteStateSchema },
  'rite:petition-remove': { input: z.object({ id: z.string() }), output: RiteStateSchema },
  'rite:petition-weight': {
    input: z.object({ id: z.string(), weight: z.number().int().min(1).max(999) }),
    output: RiteStateSchema
  },
  'rite:petitions-clear': { input: z.void(), output: RiteStateSchema },
  'rite:config': { input: RiteConfigPatchSchema, output: RiteStateSchema },
  'rite:spin': { input: z.void(), output: RiteStateSchema },
  'rite:reset': { input: z.void(), output: RiteStateSchema },
  'rite:history-clear': { input: z.void(), output: RiteStateSchema },

  /**
   * THE CONCORD (OBSERVATORY section). Chat votes; a deadlock is settled by
   * casting lots, drawn in main and carried in the cast command so the console
   * and every browser source lift the same lot at the same instant.
   *
   * Every channel returns the whole poll, as the rite's do: a partial update
   * would let a caller hold a ballot and a tally that disagree.
   */
  'concord:state': { input: z.void(), output: ConcordStateSchema },
  'concord:option-add': { input: ConcordOptionDraftSchema, output: ConcordStateSchema },
  'concord:option-remove': { input: z.object({ id: z.string() }), output: ConcordStateSchema },
  'concord:ballot': { input: ConcordBallotSchema, output: ConcordStateSchema },
  'concord:ballot-clear': { input: z.void(), output: ConcordStateSchema },
  'concord:config': { input: ConcordConfigPatchSchema, output: ConcordStateSchema },
  'concord:open': { input: z.void(), output: ConcordStateSchema },
  'concord:close': { input: z.void(), output: ConcordStateSchema },
  'concord:reset': { input: z.void(), output: ConcordStateSchema },
  'concord:history-clear': { input: z.void(), output: ConcordStateSchema },
  /**
   * Synthetic votes. **Refused outside development** by its handler.
   *
   * A poll cannot be exercised without an audience, and this is how the flush
   * cadence, the bar smoothing and the casting were tuned.
   */
  'concord:simulate': {
    input: z.object({
      count: z.number().int().min(1).max(5_000),
      changeVotes: z.boolean().optional()
    }),
    output: ConcordStateSchema
  },

  /** Read-only chat ingest, shared by every consumer that files from chat. */
  'chat:status': { input: z.void(), output: ChatStatusSchema },
  'chat:reconnect': { input: z.void(), output: ChatStatusSchema },

  /**
   * Countdown overlays. Every action is keyed by timer id — two timers share
   * the implementation but keep separate state, so nothing here is global.
   */
  'timer:all': { input: z.void(), output: TimerSetSchema },
  'timer:start': { input: z.object({ id: TimerIdSchema }), output: TimerStateSchema },
  'timer:pause': { input: z.object({ id: TimerIdSchema }), output: TimerStateSchema },
  'timer:toggle': { input: z.object({ id: TimerIdSchema }), output: TimerStateSchema },
  'timer:reset': { input: z.object({ id: TimerIdSchema }), output: TimerStateSchema },
  'timer:restart': { input: z.object({ id: TimerIdSchema }), output: TimerStateSchema },
  /** Adds or removes time without disturbing a run in progress. */
  'timer:extend': {
    input: z.object({ id: TimerIdSchema, deltaMs: z.number().int() }),
    output: TimerStateSchema
  },
  'timer:config': {
    input: z.object({ id: TimerIdSchema, patch: TimerConfigPatchSchema }),
    output: TimerStateSchema
  },

  /**
   * NOW TRANSMITTING. Reference-counted like telemetry: Spotify is polled only
   * while something is watching, so an idle app spends no rate limit.
   */
  'nowplaying:subscribe': { input: z.void(), output: NowPlayingStateSchema },
  'nowplaying:unsubscribe': { input: z.void(), output: z.void() },
  'nowplaying:state': { input: z.void(), output: NowPlayingStateSchema },
  /**
   * Presentation, addressed to one source.
   *
   * There is no channel that edits "the" config any more: every OBS scene
   * points at its own source, so an edit has to name which one it is for.
   */
  'nowplaying:source-config': {
    input: NowPlayingSourceConfigSchema,
    output: NowPlayingStateSchema
  },
  'nowplaying:source-add': { input: NowPlayingSourceDraftSchema, output: NowPlayingStateSchema },
  'nowplaying:source-rename': {
    input: NowPlayingSourceRenameSchema,
    output: NowPlayingStateSchema
  },
  'nowplaying:source-remove': {
    input: z.object({ id: z.string() }),
    output: NowPlayingStateSchema
  },
  /** One poller serves every source, so the interval is one setting. */
  'nowplaying:poll': {
    input: z.object({ seconds: z.number() }),
    output: NowPlayingStateSchema
  },
  /** Opens the authorisation page in the operator's own browser. */
  'nowplaying:link': { input: z.void(), output: NowPlayingStateSchema },
  'nowplaying:unlink': { input: z.void(), output: NowPlayingStateSchema },
  /** Redirect URI to register, plus whether a client id has been saved. */
  'nowplaying:setup': { input: z.void(), output: SpotifySetupSchema },

  /*
   * DISPATCH — the shared suggestion board.
   *
   * Every write returns the state, as everywhere else here, but note what that
   * state is: a mirror of a *remote* database, and the write will not be
   * reflected in it yet. The change arrives moments later on the broadcast
   * channel below, having gone to Firebase and come back. Nothing is applied
   * optimistically — see the service for why that trade is the right one on a
   * board two people share.
   */
  'dispatch:state': { input: z.void(), output: DispatchStateSchema },
  'dispatch:setup': { input: z.void(), output: DispatchSetupSchema },
  /** Accepts the whole snippet the Firebase console shows, not just JSON. */
  'dispatch:configure': { input: z.object({ source: z.string() }), output: DispatchStateSchema },
  'dispatch:file': { input: DispatchDraftSchema, output: DispatchStateSchema },
  'dispatch:comment': { input: DispatchCommentDraftSchema, output: DispatchStateSchema },
  /** Resolve, deny with a reason, or put an item back to pending. */
  'dispatch:rule': { input: DispatchRulingSchema, output: DispatchStateSchema },
  'dispatch:seen': { input: DispatchSeenMarkSchema, output: DispatchStateSchema },
  /** Removes the item and its discussion. Distinct from denying it. */
  'dispatch:withdraw': { input: z.object({ id: z.string() }), output: DispatchStateSchema },

  'overlay:info': { input: z.void(), output: OverlayServerInfoSchema },
  /** Rebinds the server, picking up a changed port from settings. */
  'overlay:restart': { input: z.void(), output: OverlayServerInfoSchema },

  'shell:open-external': { input: z.object({ url: z.string() }), output: z.void() },
  'shell:reveal': { input: z.object({ path: z.string() }), output: z.void() },
  /** Opens a file with whatever the OS has registered for it. */
  'shell:open-path': { input: z.object({ path: z.string() }), output: z.void() },
  'dialog:select-directory': {
    input: z.object({ title: z.string().optional() }).optional(),
    output: z.string().nullable()
  },
  'dialog:select-file': {
    input: z
      .object({
        title: z.string().optional(),
        filters: z.array(z.object({ name: z.string(), extensions: z.array(z.string()) })).optional()
      })
      .optional(),
    output: z.string().nullable()
  }
} satisfies Record<string, { input: z.ZodType; output: z.ZodType }>

export type InvokeMap = typeof IPC_INVOKE
export type InvokeChannel = keyof InvokeMap
export type InvokeInput<C extends InvokeChannel> = z.infer<InvokeMap[C]['input']>
export type InvokeOutput<C extends InvokeChannel> = z.infer<InvokeMap[C]['output']>

export const INVOKE_CHANNELS = Object.keys(IPC_INVOKE) as InvokeChannel[]

/** Main -> renderer push channels. */
export const IPC_EVENT = {
  'boot:progress': BootSnapshotSchema,
  'archive:status': ArchiveStatusSchema,
  'update:status': UpdateStatusSchema,
  'telemetry:sample': TelemetryStateSchema,
  'projects:scan': ScanStateSchema,
  'rite:state': RiteStateSchema,
  'concord:state': ConcordStateSchema,
  'chat:status': ChatStatusSchema,
  'timer:state': TimerStateSchema,
  'nowplaying:state': NowPlayingStateSchema,
  'dispatch:state': DispatchStateSchema,
  'overlay:info': OverlayServerInfoSchema,
  'window:state': WindowStateSchema
} satisfies Record<string, z.ZodType>

export type EventMap = typeof IPC_EVENT
export type EventChannel = keyof EventMap
export type EventPayload<C extends EventChannel> = z.infer<EventMap[C]>

export const EVENT_CHANNELS = Object.keys(IPC_EVENT) as EventChannel[]

/** Structured error shape carried across the process boundary. */
export interface SerializedError {
  name: string
  code: string
  message: string
  /** Operator-facing remediation hint, when one is known. */
  hint: string | null
  recoverable: boolean
  stack?: string
}

export type IpcResponse<T> = { ok: true; data: T } | { ok: false; error: SerializedError }
