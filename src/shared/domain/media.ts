import { z } from 'zod'

/**
 * The one file-on-disk schema, for every department that names a file.
 *
 * ## Why this is its own module
 *
 * It was declared in `projects.ts`, which is where the scanner's output is
 * described and where it belongs by subject. Then DISCOGRAPHY needed it: a
 * release track carries the master file that shipped, and that file is one of
 * the project's own bounces.
 *
 * `projects.ts` already imports `ReleaseAppearanceSchema` from
 * `discography.ts`, so importing this back the other way would be a **runtime
 * import cycle** — whichever module the bundler evaluates second reads a
 * binding that has not been initialised yet, and the application dies at load
 * with
 *
 *     ReferenceError: Cannot access 'MediaFileSchema' before initialization
 *
 * That exact failure cost this project a launch on 2026-09-16, with
 * `IsoDateSchema`. The fix was `dates.ts`, and this is the same fix for the
 * same reason: when two domain modules both need a schema, it belongs in a
 * leaf neither of them owns. Nothing here imports anything but zod, so it can
 * never participate in a cycle no matter who reaches for it.
 *
 * `projects.ts` re-exports it, so every existing importer keeps working.
 */
export const MediaFileSchema = z.object({
  path: z.string(),
  fileName: z.string(),
  /** Path relative to the project folder, for readable listings. */
  relativePath: z.string(),
  sizeBytes: z.number().min(0),
  modifiedAt: z.number()
})
export type MediaFile = z.infer<typeof MediaFileSchema>
