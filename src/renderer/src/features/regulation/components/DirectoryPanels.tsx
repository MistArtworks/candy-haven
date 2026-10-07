import { useMemo, useState, type DragEvent, type ReactNode } from 'react'
import {
  MAX_NAVIGATION_CATEGORIES,
  MAX_NAVIGATION_CATEGORY_LABEL,
  SECTIONS,
  arrangeSections,
  completeCategories,
  getSection,
  isSectionId,
  type SectionId
} from '@shared/domain/navigation'
import type { NavigationSettings, Settings } from '@shared/domain/settings'
import type { ApplySettings } from '@renderer/hooks/useSettings'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Select } from '@renderer/components/primitives/Select'
import { Icon } from '@renderer/features/strip/icons'
import { formatIndex } from '@renderer/lib/format'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import styles from '../RegulationPage.module.scss'
import own from './DirectoryPanels.module.scss'

/** What a dragged row carries: a page (to move or pin), or a category. */
const PAGE_DRAG = 'application/x-candy-page'
const CATEGORY_DRAG = 'application/x-candy-category'

const EMPTY: NavigationSettings = { categories: null, pinned: [], pinnedCategories: [] }

interface Category {
  id: string
  label: string
  sections: string[]
}

/** Where a drop would land, for the gold line. Null `before`: at the end. */
type Slot =
  | { kind: 'page'; category: string; before: string | null }
  | { kind: 'pinned'; before: string | null }
  | { kind: 'category'; before: string | null }

export interface DirectoryPanelsProps {
  settings: Settings | null
  apply: ApplySettings
}

/**
 * REGULATION, DIRECTORY: the rail, arranged.
 *
 * The user asked for categories of their own, to rename and reorganise them,
 * and to pin the pages and categories used most, with the pages keeping their
 * names. So: pinned pages, a block at the top of the rail, always open; and the
 * categories, each a list of pages that can be renamed, reordered, pinned
 * (first in the rail, always open) or deleted once empty. Pages move by their
 * handle, between categories and into PINNED, or by Move to and the arrows.
 *
 * The editor shows the rail's order: pinned categories first, as the rail
 * draws them. Every change is a draft like the rest of the page, previewed in
 * the rail as it is made and kept with File changes. The console's own
 * arrangement is one press away, and new departments from an update find
 * their way into it whatever the operator has done (`completeCategories`).
 */
export function DirectoryPanels({ settings, apply }: DirectoryPanelsProps): ReactNode {
  const navigation = settings?.navigation ?? EMPTY
  const arrangement = useMemo(() => arrangeSections(navigation), [navigation])
  const pinnedCategories = navigation.pinnedCategories
  const pinnedPages = arrangement.pinned.map((section) => section.id)

  // The rail's order: pinned categories first.
  const categories = useMemo<Category[]>(() => {
    const whole = completeCategories(navigation.categories).map((category) => ({
      id: category.id,
      label: category.label,
      sections: [...category.sections]
    }))
    const pinned = new Set(pinnedCategories)
    return [
      ...whole.filter((category) => pinned.has(category.id)),
      ...whole.filter((category) => !pinned.has(category.id))
    ]
  }, [navigation.categories, pinnedCategories])

  const arranged = navigation.categories !== null || pinnedCategories.length > 0
  const [dragging, setDragging] = useState<string | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [named, setNamed] = useState<string | null>(null)

  // ----------------------------------------------------------------- writing

  const saveCategories = (next: Category[], extra: Partial<NavigationSettings> = {}): void => {
    const stored = next.map((category) => ({
      id: category.id,
      label: category.label,
      sections: [...category.sections]
    }))
    apply({ navigation: { categories: stored, ...extra } })
  }

  const savePinned = (next: string[]): void => {
    apply({ navigation: { pinned: next } })
  }

  /** Takes a page out of wherever it is and puts it before `before` in `to`. */
  const moveSection = (id: string, to: string, before: string | null): void => {
    if (id === before) return
    const next = categories.map((category) => ({
      ...category,
      sections: category.sections.filter((entry) => entry !== id)
    }))
    const target = next.find((category) => category.id === to)
    if (!target) return
    const at = before === null ? -1 : target.sections.indexOf(before)
    target.sections =
      at < 0
        ? [...target.sections, id]
        : [...target.sections.slice(0, at), id, ...target.sections.slice(at)]
    saveCategories(next)
  }

  const shiftSection = (category: Category, id: string, delta: -1 | 1): void => {
    const index = category.sections.indexOf(id)
    const swap = index + delta
    if (index < 0 || swap < 0 || swap >= category.sections.length) return
    const sections = [...category.sections]
    ;[sections[index], sections[swap]] = [sections[swap], sections[index]]
    saveCategories(
      categories.map((entry) => (entry.id === category.id ? { ...entry, sections } : entry))
    )
  }

  /** Moves a category before `before`, among categories pinned the same way. */
  const moveCategory = (id: string, before: string | null): void => {
    if (id === before) return
    const moving = categories.find((category) => category.id === id)
    if (!moving) return
    const rest = categories.filter((category) => category.id !== id)
    const pinned = pinnedCategories.includes(id)
    let at = before === null ? rest.length : rest.findIndex((category) => category.id === before)
    if (at < 0) at = rest.length
    // Pinned ones stay first: a drop across the line lands at the line.
    const firstUnpinned = rest.findIndex((category) => !pinnedCategories.includes(category.id))
    const boundary = firstUnpinned < 0 ? rest.length : firstUnpinned
    at = pinned ? Math.min(at, boundary) : Math.max(at, boundary)
    saveCategories([...rest.slice(0, at), moving, ...rest.slice(at)])
  }

  const shiftCategory = (id: string, delta: -1 | 1): void => {
    const index = categories.findIndex((category) => category.id === id)
    const neighbour = categories[index + delta]
    if (!neighbour) return
    if (pinnedCategories.includes(id) !== pinnedCategories.includes(neighbour.id)) return
    const next = [...categories]
    ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
    saveCategories(next)
  }

  const rename = (id: string, label: string): void => {
    saveCategories(
      categories.map((category) =>
        category.id === id
          ? { ...category, label: label.slice(0, MAX_NAVIGATION_CATEGORY_LABEL) }
          : category
      )
    )
  }

  const addCategory = (): void => {
    if (categories.length >= MAX_NAVIGATION_CATEGORIES) return
    const taken = new Set(categories.map((category) => category.label.trim().toUpperCase()))
    let label = 'NEW CATEGORY'
    for (let n = 2; taken.has(label); n += 1) label = `NEW CATEGORY ${n}`
    const id = `custom-${Math.random().toString(36).slice(2, 10)}`
    setNamed(id)
    saveCategories([...categories, { id, label, sections: [] }])
  }

  const removeCategory = (id: string): void => {
    const category = categories.find((entry) => entry.id === id)
    if (!category || category.sections.length > 0) return
    saveCategories(
      categories.filter((entry) => entry.id !== id),
      { pinnedCategories: pinnedCategories.filter((entry) => entry !== id) }
    )
  }

  const togglePinCategory = (id: string): void => {
    const pinned = pinnedCategories.includes(id)
    const nextPinned = pinned
      ? pinnedCategories.filter((entry) => entry !== id)
      : [...pinnedCategories, id]
    // Pinned ones lead, as the rail draws them: the new one last among them.
    const set = new Set(nextPinned)
    const order = [
      ...nextPinned.map((entry) => categories.find((category) => category.id === entry)),
      ...categories.filter((category) => !set.has(category.id))
    ].filter((category): category is Category => Boolean(category))
    saveCategories(order, { pinnedCategories: nextPinned })
  }

  const togglePinPage = (id: SectionId): void => {
    savePinned(
      pinnedPages.includes(id) ? pinnedPages.filter((entry) => entry !== id) : [...pinnedPages, id]
    )
  }

  const pinAt = (id: string, before: string | null): void => {
    if (!isSectionId(id) || id === before) return
    const rest = pinnedPages.filter((entry) => entry !== id)
    const at = before === null ? -1 : rest.indexOf(before as SectionId)
    savePinned(at < 0 ? [...rest, id] : [...rest.slice(0, at), id, ...rest.slice(at)])
  }

  const shiftPinned = (id: SectionId, delta: -1 | 1): void => {
    const index = pinnedPages.indexOf(id)
    const swap = index + delta
    if (index < 0 || swap < 0 || swap >= pinnedPages.length) return
    const next = [...pinnedPages]
    ;[next[index], next[swap]] = [next[swap], next[index]]
    savePinned(next)
  }

  const reset = (): void => {
    apply({ navigation: { categories: null, pinnedCategories: [] } })
  }

  // --------------------------------------------------------- dragging rows

  const half = (event: DragEvent<HTMLElement>): 'upper' | 'lower' => {
    const box = event.currentTarget.getBoundingClientRect()
    return event.clientY < box.top + box.height / 2 ? 'upper' : 'lower'
  }

  const sameSlot = (a: Slot | null, b: Slot): boolean =>
    a !== null &&
    a.kind === b.kind &&
    a.before === b.before &&
    (a.kind !== 'page' || b.kind !== 'page' || a.category === b.category)

  const over = (event: DragEvent<HTMLElement>, next: Slot, accepts: string): void => {
    if (!event.dataTransfer.types.includes(accepts)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    setSlot((was) => (sameSlot(was, next) ? was : next))
  }

  const done = (): void => {
    setDragging(null)
    setSlot(null)
  }

  const dropPage = (event: DragEvent<HTMLElement>, at: Slot): void => {
    event.preventDefault()
    event.stopPropagation()
    const id = event.dataTransfer.getData(PAGE_DRAG)
    done()
    if (!id) return
    if (at.kind === 'pinned') pinAt(id, at.before)
    else if (at.kind === 'page') moveSection(id, at.category, at.before)
  }

  const dropCategory = (event: DragEvent<HTMLElement>, before: string | null): void => {
    event.preventDefault()
    event.stopPropagation()
    const id = event.dataTransfer.getData(CATEGORY_DRAG)
    done()
    if (id) moveCategory(id, before)
  }

  const handle = (type: string, id: string, label: string): ReactNode => (
    <span
      className={styles.pinHandle}
      draggable
      aria-label={`Drag ${label}`}
      {...tooltipTrigger('Drag to move')}
      onDragStart={(event) => {
        event.dataTransfer.setData(type, id)
        event.dataTransfer.effectAllowed = 'move'
        const row = event.currentTarget.closest('li')
        if (row) event.dataTransfer.setDragImage(row, 14, row.offsetHeight / 2)
        setDragging(id)
      }}
      onDragEnd={done}
    >
      <Icon glyph="grip" size={16} />
    </span>
  )

  const arrows = (
    label: string,
    first: boolean,
    last: boolean,
    shift: (d: -1 | 1) => void
  ): ReactNode => (
    <span className={styles.pinTools}>
      <button
        type="button"
        aria-label={`Move ${label} up`}
        disabled={first}
        onClick={() => shift(-1)}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={`Move ${label} down`}
        disabled={last}
        onClick={() => shift(1)}
      >
        ↓
      </button>
    </span>
  )

  /** A drop over a row's upper half lands before it, its lower half after. */
  const rowSlot = (
    event: DragEvent<HTMLElement>,
    list: readonly string[],
    id: string,
    make: (before: string | null) => Slot
  ): Slot => {
    const index = list.indexOf(id)
    return make(half(event) === 'upper' ? id : (list[index + 1] ?? null))
  }

  const markFor = (
    list: readonly string[],
    id: string,
    matches: (s: Slot) => boolean
  ): 'before' | 'after' | undefined => {
    if (!slot || !matches(slot)) return undefined
    if (slot.before === id) return 'before'
    if (slot.before === null && list.at(-1) === id) return 'after'
    return undefined
  }

  // ------------------------------------------------------------------ pages

  const pageChoices = categories.map((category) => ({
    value: category.id,
    label: category.label.trim() || 'UNTITLED'
  }))

  const pageRow = (category: Category, id: string, index: number): ReactNode => {
    if (!isSectionId(id)) return null
    const section = getSection(id)
    const pinned = pinnedPages.includes(id)
    return (
      <li
        key={id}
        className={own.pageRow}
        data-dragging={dragging === id || undefined}
        data-drop={markFor(
          category.sections,
          id,
          (s) => s.kind === 'page' && s.category === category.id
        )}
        onDragOver={(event) =>
          over(
            event,
            rowSlot(event, category.sections, id, (before) => ({
              kind: 'page',
              category: category.id,
              before
            })),
            PAGE_DRAG
          )
        }
        onDrop={(event) =>
          dropPage(
            event,
            rowSlot(event, category.sections, id, (before) => ({
              kind: 'page',
              category: category.id,
              before
            }))
          )
        }
      >
        {handle(PAGE_DRAG, id, section.label)}
        <span className={own.number}>{formatIndex(arrangement.numberOf(id))}</span>
        <span className={own.name}>
          <span className={own.label}>{section.label}</span>
          <span className={own.purpose}>{section.purpose}</span>
        </span>
        <Select
          ariaLabel={`Move ${section.label} to`}
          value={category.id}
          options={pageChoices}
          onChange={(to) => moveSection(id, to, null)}
        />
        {arrows(section.label, index === 0, index === category.sections.length - 1, (delta) =>
          shiftSection(category, id, delta)
        )}
        <button
          type="button"
          className={own.pinToggle}
          aria-pressed={pinned}
          onClick={() => togglePinPage(id)}
          {...tooltipTrigger(pinned ? 'Take it off PINNED' : 'Pin it to the top of the rail')}
        >
          {pinned ? 'Pinned' : 'Pin'}
        </button>
      </li>
    )
  }

  // ------------------------------------------------------------- the panels

  const unpinned = SECTIONS.filter((section) => !pinnedPages.includes(section.id))

  return (
    <>
      <Panel label="Pinned pages" index="01" className={styles.wide}>
        <div className={own.stack}>
          <p className={styles.controlHint}>
            Pinned pages sit at the top of the rail, always open, above the categories. They stay in
            their categories too. Drag a page here from below, or choose one.
          </p>

          <ul
            className={own.rows}
            onDragOver={(event) => over(event, { kind: 'pinned', before: null }, PAGE_DRAG)}
            onDrop={(event) => dropPage(event, { kind: 'pinned', before: null })}
          >
            {pinnedPages.length === 0 ? (
              <li className={own.empty} data-drop={slot?.kind === 'pinned' ? 'into' : undefined}>
                Nothing pinned yet.
              </li>
            ) : (
              pinnedPages.map((id, index) => {
                const section = getSection(id)
                const make = (before: string | null): Slot => ({ kind: 'pinned', before })
                return (
                  <li
                    key={id}
                    className={own.pinnedRow}
                    data-dragging={dragging === id || undefined}
                    data-drop={markFor(pinnedPages, id, (s) => s.kind === 'pinned')}
                    onDragOver={(event) =>
                      over(event, rowSlot(event, pinnedPages, id, make), PAGE_DRAG)
                    }
                    onDrop={(event) => dropPage(event, rowSlot(event, pinnedPages, id, make))}
                  >
                    {handle(PAGE_DRAG, id, section.label)}
                    <span className={own.number}>{formatIndex(arrangement.numberOf(id))}</span>
                    <span className={own.name}>
                      <span className={own.label}>{section.label}</span>
                      <span className={own.purpose}>
                        In {arrangement.categoryOf(id)?.label ?? 'the rail'}
                      </span>
                    </span>
                    {arrows(section.label, index === 0, index === pinnedPages.length - 1, (delta) =>
                      shiftPinned(id, delta)
                    )}
                    <button
                      type="button"
                      className={own.pinToggle}
                      aria-pressed
                      onClick={() => togglePinPage(id)}
                    >
                      Unpin
                    </button>
                  </li>
                )
              })
            )}
          </ul>

          {unpinned.length > 0 ? (
            <div className={own.pinChooser}>
              <span className={styles.controlLabel}>Pin a page</span>
              <Select
                ariaLabel="Pin a page"
                value=""
                placeholder="Choose a page…"
                options={unpinned.map((section) => ({
                  value: section.id,
                  label: section.label,
                  hint: arrangement.categoryOf(section.id)?.label
                }))}
                onChange={(id) => {
                  if (isSectionId(id)) togglePinPage(id)
                }}
              />
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel label="Categories" index="02" className={styles.wide}>
        <div className={own.stack}>
          <div className={own.toolbar}>
            <p className={styles.controlHint}>
              The rail&rsquo;s categories, top to bottom. Rename one by typing over its name, move
              pages between them by their handle or with Move to, and pin a category to keep it open
              at the top. A category can be deleted once it&rsquo;s empty. Page names stay as they
              are.
            </p>
            <div className={own.toolbarButtons}>
              <Button
                size="sm"
                variant="primary"
                disabled={categories.length >= MAX_NAVIGATION_CATEGORIES}
                onClick={addCategory}
              >
                New category
              </Button>
              <Button size="sm" variant="ghost" disabled={!arranged} onClick={reset}>
                Back to the console&rsquo;s own
              </Button>
            </div>
          </div>

          <ol className={own.categories}>
            {categories.map((category, index) => {
              const pinned = pinnedCategories.includes(category.id)
              const neighbourAbove = categories[index - 1]
              const neighbourBelow = categories[index + 1]
              const first =
                !neighbourAbove || pinnedCategories.includes(neighbourAbove.id) !== pinned
              const last =
                !neighbourBelow || pinnedCategories.includes(neighbourBelow.id) !== pinned
              const label = category.label.trim() || 'UNTITLED'
              const headSlot = (event: DragEvent<HTMLElement>): string | null =>
                half(event) === 'upper' ? category.id : (neighbourBelow?.id ?? null)

              return (
                <li
                  key={category.id}
                  className={own.category}
                  data-pinned={pinned || undefined}
                  data-dragging={dragging === category.id || undefined}
                  data-drop={
                    slot?.kind === 'category'
                      ? slot.before === category.id
                        ? 'before'
                        : slot.before === null && !neighbourBelow
                          ? 'after'
                          : undefined
                      : undefined
                  }
                >
                  <div
                    className={own.categoryHead}
                    onDragOver={(event) => {
                      if (event.dataTransfer.types.includes(CATEGORY_DRAG)) {
                        over(event, { kind: 'category', before: headSlot(event) }, CATEGORY_DRAG)
                      } else {
                        over(
                          event,
                          {
                            kind: 'page',
                            category: category.id,
                            before: category.sections[0] ?? null
                          },
                          PAGE_DRAG
                        )
                      }
                    }}
                    onDrop={(event) => {
                      if (event.dataTransfer.types.includes(CATEGORY_DRAG)) {
                        dropCategory(event, headSlot(event))
                      } else {
                        dropPage(event, {
                          kind: 'page',
                          category: category.id,
                          before: category.sections[0] ?? null
                        })
                      }
                    }}
                  >
                    {handle(CATEGORY_DRAG, category.id, label)}
                    <input
                      className={own.categoryName}
                      value={category.label}
                      maxLength={MAX_NAVIGATION_CATEGORY_LABEL}
                      aria-label="Category name"
                      placeholder="UNTITLED"
                      autoFocus={named === category.id}
                      onFocus={(event) => {
                        if (named === category.id) {
                          event.currentTarget.select()
                          setNamed(null)
                        }
                      }}
                      onChange={(event) => rename(category.id, event.target.value)}
                    />
                    <span className={own.count}>
                      {category.sections.length} {category.sections.length === 1 ? 'page' : 'pages'}
                    </span>
                    <button
                      type="button"
                      className={own.pinToggle}
                      aria-pressed={pinned}
                      onClick={() => togglePinCategory(category.id)}
                      {...tooltipTrigger(
                        pinned
                          ? 'Unpin: it folds away like the others'
                          : 'Pin: first in the rail, and always open'
                      )}
                    >
                      {pinned ? 'Pinned' : 'Pin'}
                    </button>
                    {arrows(label, first, last, (delta) => shiftCategory(category.id, delta))}
                    <button
                      type="button"
                      className={own.deleteCategory}
                      disabled={category.sections.length > 0}
                      onClick={() => removeCategory(category.id)}
                      {...tooltipTrigger(
                        category.sections.length > 0
                          ? 'Move its pages to other categories first'
                          : `Delete ${label}`
                      )}
                    >
                      Delete
                    </button>
                  </div>

                  {category.sections.length === 0 ? (
                    <div
                      className={own.empty}
                      data-drop={
                        slot?.kind === 'page' && slot.category === category.id ? 'into' : undefined
                      }
                      onDragOver={(event) =>
                        over(
                          event,
                          { kind: 'page', category: category.id, before: null },
                          PAGE_DRAG
                        )
                      }
                      onDrop={(event) =>
                        dropPage(event, { kind: 'page', category: category.id, before: null })
                      }
                    >
                      Empty. Drag a page here, or choose this category in a page&rsquo;s Move to.
                    </div>
                  ) : (
                    <ul className={own.rows}>
                      {category.sections.map((id, row) => pageRow(category, id, row))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      </Panel>
    </>
  )
}
