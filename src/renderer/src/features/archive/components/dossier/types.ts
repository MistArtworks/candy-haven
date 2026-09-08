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
}
