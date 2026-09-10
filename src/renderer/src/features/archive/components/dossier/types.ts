import type { ProjectRecord } from '@shared/domain/projects'
import type { useProjectMutations } from '@renderer/hooks/useProjects'

/**
 * Every dossier tab receives the whole record and the shared mutation set.
 *
 * The mutations are passed down rather than each tab calling
 * `useProjectMutations()` itself so that in-flight and error state is one thing
 * the dossier shell can report, instead of five independent copies whose
 * failures would each need their own place to surface.
 */
export interface DossierTabProps {
  project: ProjectRecord
  mutations: ReturnType<typeof useProjectMutations>
  /**
   * Opening the project on disk, and opening its set.
   *
   * Owned by the shell rather than by the tab, because "open this project" is a
   * property of the dossier and not of whichever tab happens to be showing. The
   * tab decides only where the two controls sit.
   */
  open: {
    folder: () => void
    ableton: () => void
    /** True when the folder is gone: both actions would raise an OS dialog. */
    missing: boolean
    /** True when there is no `.als` to hand to Ableton. */
    setless: boolean
  }
}
