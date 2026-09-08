import type { BootSnapshot } from '../domain/boot'
import type { ArchiveStatus } from '../domain/archive'
import type { Settings, SettingsPatch } from '../domain/settings'
import type { RuntimeInfo, WindowState } from '../domain/system'
import type { UpdateStatus } from '../domain/update'
import type { TelemetryState } from '../domain/telemetry'
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
