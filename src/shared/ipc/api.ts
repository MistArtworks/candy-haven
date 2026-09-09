import type { BootSnapshot } from '../domain/boot'
import type { ArchiveStatus } from '../domain/archive'
import type { Settings, SettingsPatch } from '../domain/settings'
import type { RuntimeInfo, WindowState } from '../domain/system'
import type { UpdateStatus } from '../domain/update'
import type { TelemetryState } from '../domain/telemetry'
import type { OverlayServerInfo, PetitionDraft, RiteConfigPatch, RiteState } from '../domain/rite'
import type { ConcordConfigPatch, ConcordOptionDraft, ConcordState } from '../domain/concord'
import type { ChatStatus } from '../domain/chat'
import type { TimerConfigPatch, TimerId, TimerSet, TimerState } from '../domain/timer'
import type { NowPlayingConfigPatch, NowPlayingState, SpotifySetup } from '../domain/nowplaying'
import type {
  MarketingAsset,
  MarketingAssetKind,
  NoteDraft,
  ProjectPatch,
  ProjectQuery,
  ProjectRecord,
  ProjectRegistry,
  ScanState,
  UnlinkedMedia
} from '../domain/projects'
import type {
  TransmissionSchedule,
  TransmissionTaskDraft,
  TransmissionTaskPatch
} from '../domain/transmissions'

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
    addMarketingAsset(id: string, kind: MarketingAssetKind): Promise<ProjectRecord>
    saveMarketingAsset(id: string, asset: MarketingAsset): Promise<ProjectRecord>
    removeMarketingAsset(id: string, assetId: string): Promise<ProjectRecord>
    /** Drops a record whose folder no longer exists. */
    forget(id: string): Promise<void>
    unlinked(limit?: number): Promise<UnlinkedMedia[]>
    /** Data URL for an image on disk, downscaled to `width`. */
    thumbnail(path: string, width?: number): Promise<string | null>
    onScan(listener: (state: ScanState) => void): Unsubscribe
  }
  /**
   * Release and promotional scheduling. `schedule()` is a projection over the
   * project registry rather than a stored record, so there is nothing to write
   * back except the operator's own tasks — and each of those returns the whole
   * rebuilt schedule, because moving one date can resolve or raise a collision
   * elsewhere in the month.
   */
  readonly transmissions: {
    schedule(): Promise<TransmissionSchedule>
    addTask(draft: TransmissionTaskDraft): Promise<TransmissionSchedule>
    updateTask(id: string, patch: TransmissionTaskPatch): Promise<TransmissionSchedule>
    removeTask(id: string): Promise<TransmissionSchedule>
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
    configure(patch: NowPlayingConfigPatch): Promise<NowPlayingState>
    /** Opens the Spotify authorisation page in the operator's browser. */
    link(): Promise<NowPlayingState>
    unlink(): Promise<NowPlayingState>
    setup(): Promise<SpotifySetup>
    onState(listener: (state: NowPlayingState) => void): Unsubscribe
  }
  readonly overlay: {
    info(): Promise<OverlayServerInfo>
    restart(): Promise<OverlayServerInfo>
    onInfo(listener: (info: OverlayServerInfo) => void): Unsubscribe
  }
  readonly shell: {
    openExternal(url: string): Promise<void>
    reveal(path: string): Promise<void>
    selectDirectory(title?: string): Promise<string | null>
    selectFile(options?: {
      title?: string
      filters?: { name: string; extensions: string[] }[]
    }): Promise<string | null>
  }
}
