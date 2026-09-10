import { useState, type ReactNode, type Ref } from 'react'
import type { ProjectCategory, ProjectSortMode, ProjectStage } from '@shared/domain/projects'
import {
  PROJECT_CATEGORIES,
  PROJECT_CATEGORY_LABEL,
  PROJECT_CATEGORY_PURPOSE,
  PROJECT_SORT_LABEL,
  PROJECT_SORT_MODES,
  PROJECT_STAGES
} from '@shared/domain/projects.constants'
import type { ArchiveLens } from '@shared/domain/stacks.constants'
import {
  ARCHIVE_LENSES,
  ARCHIVE_LENS_LABEL,
  ARCHIVE_LENS_PURPOSE
} from '@shared/domain/stacks.constants'
import { SearchInput } from '@renderer/components/primitives/Input'
import styles from './RegisterControls.module.scss'

export interface RegisterFilters {
  search: string
  stages: ProjectStage[]
  categories: ProjectCategory[]
  tags: string[]
  favouritesOnly: boolean
  includeMissing: boolean
  sort: ProjectSortMode
}

export interface RegisterControlsProps {
  filters: RegisterFilters
  onChange: (filters: RegisterFilters) => void
  /** Which lens is in scope: the folder tree, or one of the projections. */
  lens: ArchiveLens
  onLensChange: (lens: ArchiveLens) => void
  /** Tags present across the registry. */
  availableTags: readonly string[]
  stageCounts: Record<ProjectStage, number>
  categoryCounts: Record<ProjectCategory, number>
  /** Count after filtering, shown against the registry total. */
  shown: number
  total: number
  /** RELEASES draws tiles rather than a register, so it hides these controls. */
  showRegisterControls?: boolean
  /** Passed down to the search field, so a shortcut can put the caret in it. */
  searchRef?: Ref<HTMLInputElement>
}

const EMPTY_FILTERS: Omit<RegisterFilters, 'sort'> = {
  search: '',
  stages: [],
  categories: [],
  tags: [],
  favouritesOnly: false,
  includeMissing: false
}

/**
 * The register's control strip.
 *
 * Not a Panel: it operates on the panel below it, and wrapping it in its own
 * slab would read as a second object competing with the register itself. The
 * whole strip sits on one hairline rule, like the instrument legend above a
 * chart.
 *
 * **Filters live behind a disclosure**, and getting there took three attempts
 * worth recording. The chips began as two permanent rows — sixteen of them,
 * fourteen reading zero on a real library — which buried the search and the
 * lens under a wall of dead controls. Hiding the empty ones helped but left a
 * "+14 empty" link that counted something invisible and explained nothing. What
 * the operator wants is a way *in* to filtering when they intend to filter, so
 * that is what the strip offers: one FILTER control beside SORT, carrying a
 * count whenever anything is on, so a forgotten filter can never silently
 * narrow the register.
 *
 * The LIST / ICONS / BOARD toggle used to live here too and now sits in the
 * header of the panel it draws into — see `ViewToggle`.
 */
export function RegisterControls({
  filters,
  onChange,
  lens,
  onLensChange,
  availableTags,
  stageCounts,
  categoryCounts,
  shown,
  total,
  showRegisterControls = true,
  searchRef
}: RegisterControlsProps): ReactNode {
  const [open, setOpen] = useState(false)

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]

  /*
   * Counted, not merely flagged.
   *
   * A collapsed panel quietly excluding two thirds of the register is the
   * failure mode of hiding filters at all, so the control says how many are on.
   * Search is left out of the tally: it has its own visible field beside this.
   */
  const active =
    filters.categories.length +
    filters.stages.length +
    filters.tags.length +
    (filters.favouritesOnly ? 1 : 0) +
    (filters.includeMissing ? 1 : 0)

  return (
    <div className={styles.controls}>
      {/*
        The lens leads the strip, ahead of the search.

        It answers a question asked before any other — which shelf am I standing
        in — and unlike the filters, it changes what the panel *is* rather than
        what it contains.
      */}
      <div
        className={`${styles.segmented} ${styles.lensRow}`}
        role="group"
        aria-label="Register lens"
      >
        {ARCHIVE_LENSES.map((mode) => (
          <button
            key={mode}
            type="button"
            className={styles.segment}
            data-selected={lens === mode || undefined}
            aria-pressed={lens === mode}
            title={ARCHIVE_LENS_PURPOSE[mode]}
            onClick={() => onLensChange(mode)}
          >
            {ARCHIVE_LENS_LABEL[mode]}
          </button>
        ))}
      </div>

      {showRegisterControls ? (
        <>
          <div className={styles.primary}>
            <SearchInput
              inputRef={searchRef}
              value={filters.search}
              onChange={(search) => onChange({ ...filters, search })}
              placeholder="Search name, tag or note"
            />

            <div className={styles.spacer} />

            <button
              type="button"
              className={styles.filterButton}
              data-selected={open || undefined}
              data-active={active > 0 || undefined}
              aria-expanded={open}
              onClick={() => setOpen((current) => !current)}
            >
              Filter
              {active > 0 ? <span className={styles.filterCount}>{active}</span> : null}
            </button>

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

            <span className={styles.count}>
              {shown === total ? `${total} projects` : `${shown} of ${total}`}
            </span>
          </div>

          {open ? (
            <div className={styles.filters}>
              {/*
                Categories and stages share the row, with a rule between them.
                They are different axes — what a project *is* versus how far
                along it is — and running them together as one strip of chips
                would imply they were one set.

                Every chip is drawn, including the ones reading zero. Inside a
                panel the operator deliberately opened, a complete account of
                what can be filtered on is the point; it was only the permanent
                clutter that had to go. An empty one is dimmed rather than
                removed, so the list never reshuffles under the pointer.
              */}
              <div className={styles.chipRow} role="group" aria-label="Filter by category">
                {PROJECT_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={styles.filterChip}
                    data-selected={filters.categories.includes(category) || undefined}
                    data-empty={(categoryCounts[category] ?? 0) === 0 || undefined}
                    aria-pressed={filters.categories.includes(category)}
                    title={PROJECT_CATEGORY_PURPOSE[category]}
                    onClick={() =>
                      onChange({ ...filters, categories: toggle(filters.categories, category) })
                    }
                  >
                    {PROJECT_CATEGORY_LABEL[category]}
                    <span className={styles.chipCount}>{categoryCounts[category] ?? 0}</span>
                  </button>
                ))}
              </div>

              <span className={styles.axisRule} aria-hidden="true" />

              <div className={styles.chipRow} role="group" aria-label="Filter by stage">
                {PROJECT_STAGES.map((stage) => (
                  <button
                    key={stage.id}
                    type="button"
                    className={styles.filterChip}
                    data-selected={filters.stages.includes(stage.id) || undefined}
                    data-empty={(stageCounts[stage.id] ?? 0) === 0 || undefined}
                    aria-pressed={filters.stages.includes(stage.id)}
                    title={stage.purpose}
                    onClick={() =>
                      onChange({ ...filters, stages: toggle(filters.stages, stage.id) })
                    }
                  >
                    {stage.label}
                    <span className={styles.chipCount}>{stageCounts[stage.id] ?? 0}</span>
                  </button>
                ))}
              </div>

              <span className={styles.axisRule} aria-hidden="true" />

              <div className={styles.chipRow} role="group" aria-label="Other filters">
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
              </div>

              {availableTags.length > 0 ? (
                <>
                  <span className={styles.axisRule} aria-hidden="true" />
                  <div className={styles.chipRow} role="group" aria-label="Filter by tag">
                    {availableTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={`${styles.filterChip} ${styles.tagChip}`}
                        data-selected={filters.tags.includes(tag) || undefined}
                        aria-pressed={filters.tags.includes(tag)}
                        onClick={() => onChange({ ...filters, tags: toggle(filters.tags, tag) })}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              <div className={styles.spacer} />

              {active > 0 || filters.search.length > 0 ? (
                <button
                  type="button"
                  className={styles.clear}
                  onClick={() => onChange({ ...EMPTY_FILTERS, sort: filters.sort })}
                >
                  Clear
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
