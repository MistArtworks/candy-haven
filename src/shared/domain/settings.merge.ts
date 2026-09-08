import type { Settings, SettingsPatch } from './settings'

/**
 * Applies a patch to a settings object.
 *
 * Shared by the main process (before validation and persistence) and the
 * renderer (for its optimistic update), so the two can never disagree about
 * what a patch means. Zod-free: the type imports above are erased at compile
 * time, keeping this usable from the renderer bundle.
 *
 * Merging is one level deep — a patch may carry a partial section without
 * clobbering the sibling fields in it.
 */
export function mergeSettings(current: Settings, patch: SettingsPatch): Settings {
  return {
    ...current,
    appearance: { ...current.appearance, ...patch.appearance },
    workspace: { ...current.workspace, ...patch.workspace },
    archive: { ...current.archive, ...patch.archive },
    updates: { ...current.updates, ...patch.updates }
  }
}
