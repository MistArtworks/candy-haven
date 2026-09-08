import type { ReactNode } from 'react'
import type { ProjectSortMode, ProjectStage, ProjectViewMode } from '@shared/domain/projects'
import {
  PROJECT_SORT_LABEL,
  PROJECT_SORT_MODES,
  PROJECT_STAGES,
  PROJECT_VIEW_LABEL,
  PROJECT_VIEW_MODES
} from '@shared/domain/projects.constants'
import { SearchInput } from '@renderer/components/primitives/Input'
import styles from './RegisterControls.module.scss'

export interface RegisterFilters {
  search: string
  stages: ProjectStage[]
  tags: string[]
  favouritesOnly: boolean
  includeMissing: boolean
  sort: ProjectSortMode
}

export interface RegisterControlsProps {
  filters: RegisterFilters
  onChange: (filters: RegisterFilters) => void
  view: ProjectViewMode
  onViewChange: (view: ProjectViewMode) => void
  /** Tags present across the registry. */
  availableTags: readonly string[]
  stageCounts: Record<ProjectStage, number>
  /** Count after filtering, shown against the registry total. */
  shown: number
  total: number
}

/**
 * The register's control strip.
 *
 * Not a Panel: it operates on the panel below it, and wrapping it in its own
 * slab would read as a second object competing with the register itself. The
 * whole strip sits on one hairline rule, like the instrument legend above a
 * chart.
 *
 * Stage filters are toggles rather than a dropdown because the useful query is
 * usually a set — "mix and master", "everything not yet released" — and a
 * single-select control cannot express that.
 */
export function RegisterControls({
  filters,
  onChange,
  view,
  onViewChange,
  availableTags,
  stageCounts,
  shown,
  total
}: RegisterControlsProps): ReactNode {
  const toggleStage = (stage: ProjectStage): void => {
    const stages = filters.stages.includes(stage)
      ? filters.stages.filter((entry) => entry !== stage)
      : [...filters.stages, stage]
    onChange({ ...filters, stages })
  }

  const toggleTag = (tag: string): void => {
    const tags = filters.tags.includes(tag)
      ? filters.tags.filter((entry) => entry !== tag)
      : [...filters.tags, tag]
    onChange({ ...filters, tags })
  }

  const filtered =
    filters.search.length > 0 ||
    filters.stages.length > 0 ||
    filters.tags.length > 0 ||
    filters.favouritesOnly ||
    filters.includeMissing

  return (
    <div className={styles.controls}>
      <div className={styles.primary}>
        <SearchInput
          value={filters.search}
          onChange={(search) => onChange({ ...filters, search })}
          placeholder="Search name, artist, tag or note"
        />

        <div className={styles.spacer} />

        <div className={styles.selectInline}>
          <span className={styles.inlineLabel}>Sort</span>
          <select
            className={styles.select}
            value={filters.sort}
            aria-label="Sort order"
            onChange={(event) =>
              onChange({ ...filters, sort: event.target.value as ProjectSortMode })
            }
          >
            {PROJECT_SORT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {PROJECT_SORT_LABEL[mode]}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.segmented} role="group" aria-label="Register view">
          {PROJECT_VIEW_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={styles.segment}
              data-selected={view === mode || undefined}
              aria-pressed={view === mode}
              onClick={() => onViewChange(mode)}
            >
              {PROJECT_VIEW_LABEL[mode]}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.secondary}>
        <div className={styles.chipRow} role="group" aria-label="Filter by stage">
          {PROJECT_STAGES.map((stage) => (
            <button
              key={stage.id}
              type="button"
              className={styles.filterChip}
              data-selected={filters.stages.includes(stage.id) || undefined}
              aria-pressed={filters.stages.includes(stage.id)}
              title={stage.purpose}
              onClick={() => toggleStage(stage.id)}
            >
              {stage.label}
              <span className={styles.chipCount}>{stageCounts[stage.id] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className={styles.toggles}>
          <button
            type="button"
            className={styles.filterChip}
            data-selected={filters.favouritesOnly || undefined}
            aria-pressed={filters.favouritesOnly}
            onClick={() => onChange({ ...filters, favouritesOnly: !filters.favouritesOnly })}
          >
            ◆ Favourites
          </button>

          <button
            type="button"
            className={styles.filterChip}
            data-selected={filters.includeMissing || undefined}
            aria-pressed={filters.includeMissing}
            title="Show projects whose folder was not found in the last scan"
            onClick={() => onChange({ ...filters, includeMissing: !filters.includeMissing })}
          >
            Missing
          </button>

          {filtered ? (
            <button
              type="button"
              className={styles.clear}
              onClick={() =>
                onChange({
                  search: '',
                  stages: [],
                  tags: [],
                  favouritesOnly: false,
                  includeMissing: false,
                  sort: filters.sort
                })
              }
            >
              Clear
            </button>
          ) : null}

          <span className={styles.count}>
            {shown === total ? `${total} projects` : `${shown} of ${total}`}
          </span>
        </div>
      </div>

      {availableTags.length > 0 ? (
        <div className={styles.chipRow} role="group" aria-label="Filter by tag">
          {availableTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`${styles.filterChip} ${styles.tagChip}`}
              data-selected={filters.tags.includes(tag) || undefined}
              aria-pressed={filters.tags.includes(tag)}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
