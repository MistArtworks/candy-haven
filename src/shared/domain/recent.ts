import { z } from 'zod'

/**
 * Recently opened sets: what Live's own File → Open Recent Set lists, and
 * what Haven opened itself, as one list, newest first.
 *
 * Asked for by Candy on DISPATCH ("Recent projects option"): a RECENT lens in
 * ARCHIVE, and a menu of the last twenty sets like Live's, on the quick strip
 * too. Read in the main process (`RecentService`): Live keeps its list in its
 * preferences, so a set opened straight in Live counts as much as one opened
 * from here.
 */
export const RecentSetSchema = z.object({
  /** The `.als`. */
  path: z.string(),
  /** Its name, without `.als`. */
  name: z.string(),
  /** The folder it sits in: its project folder, almost always. */
  folder: z.string(),
  /** The ARCHIVE project it belongs to, when it is in the register. */
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  /** When Haven saw it opened; null when only Live's list knows of it. */
  openedAt: z.number().nullable(),
  /** False for a set moved or deleted since: Live lists those too. */
  exists: z.boolean(),
  /**
   * Made with New project's TEMPORARY, in TEMPORARY PROJECTS: never in the
   * register, and not for INTAKE either, so not "not in the archive".
   */
  temporary: z.boolean(),
  /** The set Live has open right now, read from its window title. */
  openNow: z.boolean()
})
export type RecentSet = z.infer<typeof RecentSetSchema>

/** How many the menus show: Live's own list is about this long. */
export const RECENT_MENU_SIZE = 20
