import type { BootSnapshot } from '../domain/boot'
import type { ArchiveStatus } from '../domain/archive'
import type { Settings, SettingsPatch } from '../domain/settings'
import type { RuntimeInfo, WindowState } from '../domain/system'
import type { ReleaseArrival, UpdateStatus } from '../domain/update'
import type { TelemetryState } from '../domain/telemetry'
import type { OverlayServerInfo, PetitionDraft, RiteConfigPatch, RiteState } from '../domain/rite'
import type { ConcordConfigPatch, ConcordOptionDraft, ConcordState } from '../domain/concord'
import type { ChatStatus } from '../domain/chat'
import type { AntechamberConfigPatch, AntechamberState } from '../domain/antechamber'
import type {
  DispatchCommentDraft,
  DispatchDraft,
  DispatchRuling,
  DispatchSetup,
  DispatchState
} from '../domain/dispatch'
import type { DispatchAuthor } from '../domain/dispatch.constants'
import type { TimerConfigPatch, TimerId, TimerSet, TimerState } from '../domain/timer'
import type {
  NowPlayingConfigPatch,
  NowPlayingSourceDraft,
  NowPlayingState,
  SpotifySetup
} from '../domain/nowplaying'
import type {
  NoteDraft,
  ProjectDraft,
  ProjectPatch,
  ProjectQuery,
  ProjectRecord,
  ProjectRegistry,
  ScanState
} from '../domain/projects'
import type {
  ArchiveSetupDraft,
  ArchiveSetupState,
  FolderDraft,
  FolderPatch,
  StacksTree
} from '../domain/stacks'
import type { ArchiveVolume, VolumeDraft, VolumePatch, VolumeSummary } from '../domain/volumes'
import type {
  ArchiveRelease,
  DeliverableKind,
  ReleaseDraft,
  ReleasePatch,
  ReleaseSummary
} from '../domain/releases'

/** Unsubscribe handle returned by every `on*` subscription. */
export type Unsubscribe = () => void

/**
 * The complete surface exposed on `window.candy`. Implemented by the preload
 * bridge and consumed by the renderer — no raw `ipcRenderer` reaches the UI.
 */
export interface CandyHavenApi {
  readonly runtime: {
    info(): Promise<RuntimeInfo>
  }
  readonly window: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<WindowState>
    close(): Promise<void>
    state(): Promise<WindowState>
    /**
     * Scales the whole frame — Windows' display scaling, for this window.
     *
     * Synchronous and local to the renderer; see the preload bridge for why it
     * does not go over IPC.
     */
    setZoom(factor: number): void
    onState(listener: (state: WindowState) => void): Unsubscribe
  }
  readonly boot: {
    snapshot(): Promise<BootSnapshot>
    retry(): Promise<BootSnapshot>
    enter(): Promise<void>
    onProgress(listener: (snapshot: BootSnapshot) => void): Unsubscribe
  }
  readonly archive: {
    status(): Promise<ArchiveStatus>
    provision(): Promise<ArchiveStatus>
    restart(): Promise<ArchiveStatus>
    onStatus(listener: (status: ArchiveStatus) => void): Unsubscribe
  }
  readonly settings: {
    get(): Promise<Settings>
    update(patch: SettingsPatch): Promise<Settings>
    reset(): Promise<Settings>
  }
  readonly updates: {
    status(): Promise<UpdateStatus>
    check(): Promise<UpdateStatus>
    download(): Promise<UpdateStatus>
    install(): Promise<void>
    onStatus(listener: (status: UpdateStatus) => void): Unsubscribe
  }
  readonly telemetry: {
    /** Starts sampling and returns the current state. */
    subscribe(): Promise<TelemetryState>
    /** Releases this view's interest in sampling. */
    unsubscribe(): Promise<void>
    onSample(listener: (state: TelemetryState) => void): Unsubscribe
  }
  readonly projects: {
    /** Summaries for the register views, plus filter facets and scan state. */
    registry(query?: ProjectQuery): Promise<ProjectRegistry>
    /** The full dossier for one project. */
    get(id: string): Promise<ProjectRecord>
    patch(id: string, patch: ProjectPatch): Promise<ProjectRecord>
    scan(force?: boolean): Promise<ScanState>
    cancelScan(): Promise<ScanState>
    scanState(): Promise<ScanState>
    addNote(id: string, draft: NoteDraft): Promise<ProjectRecord>
    updateNote(id: string, noteId: string, draft: NoteDraft): Promise<ProjectRecord>
    deleteNote(id: string, noteId: string): Promise<ProjectRecord>
    /** Provisions a directory, the template set and the scaffold folders. */
    create(draft: ProjectDraft): Promise<ProjectRecord>
    /** Opens the primary set in whatever the OS has registered for `.als`. */
    open(id: string): Promise<void>
    /** Drops the record. Files are left exactly where they are. */
    forget(id: string): Promise<void>
    /** Moves the project folder into the archive's recycle bin. Reversible. */
    trash(id: string): Promise<ProjectRecord>
    /** Puts a binned project back where it came from. */
    restore(id: string): Promise<ProjectRecord>
    /** Removes a binned project for good. Refused for anything still live. */
    purge(id: string): Promise<void>
    /** Data URL for an image on disk, downscaled to `width`. */
    thumbnail(path: string, width?: number): Promise<string | null>
    /** Moves the project's folder into a stacks folder, or out of the tree. */
    file(id: string, folderId: string | null): Promise<ProjectRecord>
    onScan(listener: (state: ScanState) => void): Unsubscribe
  }
  /**
   * THE STACKS — the ARCHIVE's shelving.
   *
   * Every folder is a real directory on disk, so these calls move files.
   * Each returns the whole tree, for the same reason the rite's methods return
   * the whole rite: a rename cascades through every descendant, and a caller
   * holding a folder and a count that disagree is worse than one extra payload.
   */
  readonly stacks: {
    tree(): Promise<StacksTree>
    /** Which setup gate, if any, is still unsatisfied. */
    setupState(): Promise<ArchiveSetupState>
    /** Saves the root and template, then provisions the wrapper and RELEASES. */
    setup(draft: ArchiveSetupDraft): Promise<ArchiveSetupState>
    create(draft: FolderDraft): Promise<StacksTree>
    update(id: string, patch: FolderPatch): Promise<StacksTree>
    /** Moves the folder and everything in it into the recycle bin. Reversible. */
    remove(id: string): Promise<StacksTree>
    /** Puts a binned folder and its whole subtree back. */
    restore(id: string): Promise<StacksTree>
    /** Removes a binned folder for good. Refused for anything still on a shelf. */
    purge(id: string): Promise<StacksTree>
  }
  /**
   * VOLUMES — albums, EPs and compilations.
   *
   * Metadata only; nothing here touches disk. A track joins a volume through
   * `projects.patch`, not through this interface, because the project is what
   * holds `volumeId` — see volumes.ts for why membership lives in one place.
   */
  readonly volumes: {
    list(): Promise<VolumeSummary[]>
    get(id: string): Promise<ArchiveVolume>
    create(draft: VolumeDraft): Promise<VolumeSummary>
    update(id: string, patch: VolumePatch): Promise<VolumeSummary>
    /** Detaches every track first; each falls back to `single`. */
    remove(id: string): Promise<void>
    /** Ids in their new order; writes each track's `trackNumber`. */
    reorder(id: string, projectIds: string[]): Promise<VolumeSummary[]>
  }
  /**
   * RELEASES — what is going out, and the files that go with it.
   *
   * A release owns a real directory under the wrapper, so creating, renaming
   * and attaching all move things on disk. Attaching *copies* the chosen file
   * in rather than moving it: the project keeps its own bounces.
   */
  readonly releases: {
    list(): Promise<ReleaseSummary[]>
    get(id: string): Promise<ArchiveRelease>
    create(draft: ReleaseDraft): Promise<ReleaseSummary>
    update(id: string, patch: ReleasePatch): Promise<ReleaseSummary>
    /** A null `source` detaches, leaving any copy already made in place. */
    attach(id: string, kind: DeliverableKind, source: string | null): Promise<ArchiveRelease>
    /** Drops the record; the assembled directory stays on disk. */
    remove(id: string): Promise<void>
  }
  /**
   * The selection rite served to OBS. Every method returns the whole state:
   * it is small, and one shape for every mutation means the host UI can never
   * hold a partially updated rite.
   */
  readonly rite: {
    state(): Promise<RiteState>
    addPetition(draft: PetitionDraft): Promise<RiteState>
    removePetition(id: string): Promise<RiteState>
    setWeight(id: string, weight: number): Promise<RiteState>
    clearPetitions(): Promise<RiteState>
    configure(patch: RiteConfigPatch): Promise<RiteState>
    /** Draws the winner and arms the animation on every attached surface. */
    spin(): Promise<RiteState>
    /** Clears the result and returns the ring to rest, keeping the roster. */
    reset(): Promise<RiteState>
    clearHistory(): Promise<RiteState>
    onState(listener: (state: RiteState) => void): Unsubscribe
  }
  /**
   * THE CONCORD — the chat-voted poll. Every method returns the whole poll, for
   * the same reason the rite's do.
   */
  readonly concord: {
    state(): Promise<ConcordState>
    addOption(draft: ConcordOptionDraft): Promise<ConcordState>
    removeOption(id: string): Promise<ConcordState>
    /** Replaces the whole ballot, for a pasted list. */
    setBallot(labels: string[]): Promise<ConcordState>
    clearBallot(): Promise<ConcordState>
    configure(patch: ConcordConfigPatch): Promise<ConcordState>
    /** Opens voting and starts the window, if one is set. */
    open(): Promise<ConcordState>
    /** Closes voting; escalates to THE CASTING if the chamber is deadlocked. */
    close(): Promise<ConcordState>
    /** Returns to drafting, keeping the ballot and clearing the votes. */
    reset(): Promise<ConcordState>
    clearHistory(): Promise<ConcordState>
    /** Synthetic votes. Rejected outside development. */
    simulate(count: number, changeVotes?: boolean): Promise<ConcordState>
    onState(listener: (state: ConcordState) => void): Unsubscribe
  }
  /**
   * Read-only chat ingest. There is nothing to configure here beyond the channel
   * name, which lives in settings — chat is read anonymously, so there is no
   * link step and no credential.
   */
  readonly chat: {
    status(): Promise<ChatStatus>
    /** Drops the socket and attends again, for a channel change or a fault. */
    reconnect(): Promise<ChatStatus>
    onStatus(listener: (status: ChatStatus) => void): Unsubscribe
  }
  /**
   * Countdown overlays. Nothing ticks across this boundary — the state carries
   * a start instant and the durations, and each surface derives the clock.
   */
  readonly timers: {
    all(): Promise<TimerSet>
    start(id: TimerId): Promise<TimerState>
    pause(id: TimerId): Promise<TimerState>
    /** Start if stopped, pause if running — for a single console control. */
    toggle(id: TimerId): Promise<TimerState>
    reset(id: TimerId): Promise<TimerState>
    restart(id: TimerId): Promise<TimerState>
    extend(id: TimerId, deltaMs: number): Promise<TimerState>
    configure(id: TimerId, patch: TimerConfigPatch): Promise<TimerState>
    onState(listener: (state: TimerState) => void): Unsubscribe
  }
  /**
   * Live Spotify playback. Subscription is reference-counted, so nothing is
   * polled while nobody is looking.
   */
  readonly nowPlaying: {
    subscribe(): Promise<NowPlayingState>
    unsubscribe(): Promise<void>
    state(): Promise<NowPlayingState>
    /** Presentation, addressed to one source — there is no single config. */
    configureSource(id: string, patch: NowPlayingConfigPatch): Promise<NowPlayingState>
    addSource(draft: NowPlayingSourceDraft): Promise<NowPlayingState>
    /** The slug deliberately does not follow a rename; see the service. */
    renameSource(id: string, name: string, note: string): Promise<NowPlayingState>
    /** Refused for the last remaining source. */
    removeSource(id: string): Promise<NowPlayingState>
    setPollSeconds(seconds: number): Promise<NowPlayingState>
    /** Opens the Spotify authorisation page in the operator's browser. */
    link(): Promise<NowPlayingState>
    unlink(): Promise<NowPlayingState>
    setup(): Promise<SpotifySetup>
    onState(listener: (state: NowPlayingState) => void): Unsubscribe
  }
  readonly release: {
    /** Notes for the running version, or null once acknowledged. */
    arrival(): Promise<ReleaseArrival | null>
    acknowledge(): Promise<void>
  }
  readonly dispatch: {
    state(): Promise<DispatchState>
    setup(): Promise<DispatchSetup>
    /** Accepts the whole Firebase console snippet, not just JSON. */
    configure(source: string): Promise<DispatchState>
    /** Neither the address nor the password is stored; both are exchanged for a token. */
    signIn(email: string, password: string): Promise<DispatchState>
    signOut(): Promise<DispatchState>
    file(draft: DispatchDraft): Promise<DispatchState>
    comment(draft: DispatchCommentDraft): Promise<DispatchState>
    rule(ruling: DispatchRuling): Promise<DispatchState>
    markSeen(itemId: string, author: DispatchAuthor): Promise<DispatchState>
    /** Removes the item and its discussion. Denying keeps both. */
    withdraw(id: string): Promise<DispatchState>
    onState(listener: (state: DispatchState) => void): Unsubscribe
  }
  readonly antechamber: {
    state(): Promise<AntechamberState>
    configure(patch: AntechamberConfigPatch): Promise<AntechamberState>
    reset(): Promise<AntechamberState>
    onState(listener: (state: AntechamberState) => void): Unsubscribe
  }
  readonly overlay: {
    info(): Promise<OverlayServerInfo>
    restart(): Promise<OverlayServerInfo>
    onInfo(listener: (info: OverlayServerInfo) => void): Unsubscribe
  }
  readonly shell: {
    openExternal(url: string): Promise<void>
    reveal(path: string): Promise<void>
    /** Opens a file with whatever the OS has registered for its extension. */
    openPath(path: string): Promise<void>
    selectDirectory(title?: string): Promise<string | null>
    selectFile(options?: {
      title?: string
      filters?: { name: string; extensions: string[] }[]
    }): Promise<string | null>
  }
}
