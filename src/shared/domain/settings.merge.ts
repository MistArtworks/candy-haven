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
 *
 * ### Why this iterates rather than listing the sections
 *
 * It used to name each section explicitly, and that silently broke the first
 * time a new group was added: the `integrations` group reached the schema but
 * not this function, so every write to it was dropped on both sides of the
 * boundary. The renderer's controlled inputs read from the store, so the
 * symptom was a text field that could not be typed into at all — with nothing
 * wrong with the field.
 *
 * Driving the merge off the patch's own keys means a new section works the
 * moment it exists in the schema, with nothing here to forget.
 */
export function mergeSettings(current: Settings, patch: SettingsPatch): Settings {
  const next: Settings = { ...current }

  for (const key of Object.keys(patch) as (keyof SettingsPatch)[]) {
    const section = patch[key]
    if (section === undefined) continue

    // Asserted rather than proven: TypeScript cannot see that `patch[key]` is a
    // partial of `current[key]` while the key is a variable. The correspondence
    // is guaranteed by SettingsPatchSchema being derived from SettingsSchema.
    const merged = { ...(current[key] as object), ...(section as object) }
    ;(next as Record<string, unknown>)[key] = merged
  }

  return next
}
