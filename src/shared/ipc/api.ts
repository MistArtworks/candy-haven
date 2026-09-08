import type { BootSnapshot } from '../domain/boot'
import type { ArchiveStatus } from '../domain/archive'
import type { Settings, SettingsPatch } from '../domain/settings'
import type { RuntimeInfo, WindowState } from '../domain/system'
import type { UpdateStatus } from '../domain/update'
import type { TelemetryState } from '../domain/telemetry'
import type { OverlayServerInfo, PetitionDraft, RiteConfigPatch, RiteState } from '../domain/rite'
import type { TimerConfigPatch, TimerId, TimerSet, TimerState } from '../domain/timer'
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
