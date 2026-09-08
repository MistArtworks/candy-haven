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
/**
 * The sections of a settings object, excluding the schema version.
 *
 * Derived from the patch type rather than listed, for the same reason the
 * merge iterates: a section added to the schema should need no edits here.
 */
export type SettingsSection = keyof SettingsPatch

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

/**
 * Fields that differ between two settings objects, as a patch.
 *
 * Used for two things at once, which is why it returns a patch rather than a
 * boolean: the console needs to know *whether* there are unsaved changes, and
 * needs to send exactly *what* changed when the operator saves. Deriving both
 * from one comparison means the save button and the dirty indicator can never
 * disagree.
 *
 * Values are compared structurally, because a section can hold an array — the
 * scanned project roots — and two arrays with equal contents are not the same
 * object. Cheap here: settings are a few dozen scalars.
 */
export function diffSettings(baseline: Settings, current: Settings): SettingsPatch {
  const patch: Record<string, Record<string, unknown>> = {}

  for (const section of Object.keys(current) as (keyof Settings)[]) {
    // `version` is owned by the schema, not the operator.
    if (section === 'version') continue

    const before = baseline[section] as Record<string, unknown>
    const after = current[section] as Record<string, unknown>
    if (!before || !after) continue

    for (const field of Object.keys(after)) {
      if (JSON.stringify(before[field]) === JSON.stringify(after[field])) continue
      patch[section] ??= {}
      patch[section][field] = after[field]
    }
  }

  return patch as SettingsPatch
}

/** Whether anything differs. Reads the same comparison the save button sends. */
export function hasSettingsChanges(baseline: Settings, current: Settings): boolean {
  return Object.keys(diffSettings(baseline, current)).length > 0
}
