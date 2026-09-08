import { create } from 'zustand'
import type { ArchiveStatus } from '@shared/domain/archive'
import type { BootSnapshot } from '@shared/domain/boot'
import type { Settings } from '@shared/domain/settings'
import type { WindowState } from '@shared/domain/system'
import type { UpdateStatus } from '@shared/domain/update'
import { createInitialArchiveStatus } from '@shared/domain/archive.constants'
import { createInitialBootSnapshot } from '@shared/domain/boot.constants'

/**
 * Mirror of main-process push state.
 *
 * Anything the main process *pushes* (boot progress, archive health, update
 * status, window state) lives here and is written by a single subscriber
 * component. Request/response data is fetched with React Query instead — see
 * hooks/useRuntimeInfo.
 */
export type ShellPhase = 'booting' | 'entering' | 'ready'

interface SystemState {
  boot: BootSnapshot
  archive: ArchiveStatus
  update: UpdateStatus | null
  settings: Settings | null
  window: WindowState

  /**
   * Drives the boot-screen-to-console handover. `entering` is the window during
   * which the boot cinematic plays its exit before the console mounts.
   */
  shellPhase: ShellPhase

  setBoot: (snapshot: BootSnapshot) => void
  setArchive: (status: ArchiveStatus) => void
  setUpdate: (status: UpdateStatus) => void
  setSettings: (settings: Settings) => void
  setWindow: (state: WindowState) => void
  setShellPhase: (phase: ShellPhase) => void
}

export const useSystemStore = create<SystemState>()((set) => ({
  boot: createInitialBootSnapshot(),
  archive: createInitialArchiveStatus(),
  update: null,
  settings: null,
  window: { isMaximized: false, isFullScreen: false, isFocused: true },
  shellPhase: 'booting',

  setBoot: (boot) => set({ boot }),
  setArchive: (archive) => set({ archive }),
  setUpdate: (update) => set({ update }),
  setSettings: (settings) => set({ settings }),
  setWindow: (window) => set({ window }),
  setShellPhase: (shellPhase) => set({ shellPhase })
}))

// ---------------------------------------------------------------- selectors
// Exported as stable references so components subscribe to the narrowest slice
// possible and re-render only when that slice changes.

export const selectBoot = (state: SystemState): BootSnapshot => state.boot
export const selectArchive = (state: SystemState): ArchiveStatus => state.archive
export const selectUpdate = (state: SystemState): UpdateStatus | null => state.update
export const selectSettings = (state: SystemState): Settings | null => state.settings
export const selectWindow = (state: SystemState): WindowState => state.window
export const selectShellPhase = (state: SystemState): ShellPhase => state.shellPhase
