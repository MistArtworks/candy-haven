import type { ProjectRecord, ProjectStage } from '@shared/domain/projects'
import type { TagSummary } from '@shared/domain/tags'
import type { ArtistRecord } from '@shared/domain/artists'
import type { ReleaseAppearance } from '@shared/domain/discography'
import type { useProjectMutations } from '@renderer/hooks/useProjects'
import type { useTagMutations } from '@renderer/hooks/useTags'

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
   * The tag library and the writes against it.
   *
   * Held by the shell for the same reason the project mutations are: creating
   * a tag can be refused — a name already taken, most obviously — and that
   * refusal has to surface in the one notice bar the dossier draws, not in a
   * second one owned by whichever tab happens to be open.
   */
  tags: {
    library: TagSummary[]
    mutations: ReturnType<typeof useTagMutations>
  }
  /**
   * The roster, and where this project appears in the catalogue.
   *
   * Both read-only here. Crediting somebody is a patch on the *project*, so
   * it goes through `mutations` like every other field — but the names behind
   * the ids have to come from somewhere, and that somewhere is the same
   * library the tag picker uses.
   *
   * `appearances` runs the other way and is genuinely read-only: the release
   * owns its tracklist, so the ARCHIVE can report that a project is track 3
   * of something but cannot change it from here. Editing the running order is
   * DISCOGRAPHY's, which is the only place that can see the whole order.
   */
  artists: {
    /*
     * Records rather than summaries: the registry ships the roster without
     * counts, because the ARCHIVE has no use for "on 3 releases" and
     * computing it would mean walking the catalogue on every register read.
     */
    roster: ArtistRecord[]
    appearances: ReleaseAppearance[]
  }
  /**
   * Moves the project along the pipeline.
   *
   * Owned by the shell rather than left to the tab, because a refused stage
   * change — the gates on SCHEDULED and RELEASED — has to clear the notice
   * bar's dismissal before it fires, and that bar belongs to the dossier.
   * Only OVERVIEW draws a control for it; see `StageStrip`.
   */
  setStage: (stage: ProjectStage) => void
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
