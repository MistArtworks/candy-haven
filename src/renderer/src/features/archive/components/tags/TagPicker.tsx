import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { TagSummary } from '@shared/domain/tags'
import {
  tagKey,
  validateTagName,
  MAX_TAG_NAME_LENGTH,
  TAG_SWATCHES
} from '@shared/domain/tags.constants'
import { Button } from '@renderer/components/primitives/Button'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import { ArchiveGlyph } from '../icons/ArchiveGlyph'
import { TagChip } from './TagChip'
import styles from './tags.module.scss'

export interface TagPickerProps {
  /** The tags this project carries, already resolved and in library order. */
  tags: readonly TagSummary[]
  /** Every tag that exists, for the list below the field. */
  library: readonly TagSummary[]
  /**
   * The shelf this project is filed on.
   *
   * Two jobs: it lifts that shelf's own tags to the top of the list, and it
   * becomes the home shelf of anything created from here. Null for an unfiled
   * project, which simply means no group leads and new tags are made homeless.
   */
  homeFolderId: string | null
  /** Name of that shelf, for the group heading. */
  homeFolderName: string | null
  busy?: boolean
  onToggle: (tagId: string, next: boolean) => void
  /** A null colour means "pick one for me" — the service draws at random. */
  onCreate: (name: string, colour: string | null) => void
  onManage: () => void
}

/**
 * Tags on one project: what it carries, and how to change that.
 *
 * The list expands **inline** rather than floating over the panel. A dropdown
 * would have to be positioned against a body that scrolls inside a modal that
 * is itself inside the motion page wrapper, and every layer of that is a
 * chance to be clipped or left behind by a scroll. Pushing the panel taller is
 * unglamorous and cannot go wrong.
 *
 * Tags are **global with an advisory home shelf** — see tags.constants.ts. So
 * the list shows the whole library and merely *orders* the current shelf's
 * tags first: browsing Dubstep puts `140`, `Deep` and `Dark` under the hand
 * without making them unreachable from anywhere else.
 */
export function TagPicker({
  tags,
  library,
  homeFolderId,
  homeFolderName,
  busy = false,
  onToggle,
  onCreate,
  onManage
}: TagPickerProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  /*
   * Null is a real choice here, not an unset field: it means "any colour", and
   * the service rolls one. Defaulting the strip to a selected swatch would
   * make every tag made in a hurry the same colour, which is the failure this
   * whole feature is trying to avoid.
   */
  const [colour, setColour] = useState<string | null>(null)

  const carried = useMemo(() => new Set(tags.map((tag) => tag.id)), [tags])
  const trimmed = query.trim()

  /**
   * The library, filtered and split into home shelf and the rest.
   *
   * Both halves stay alphabetical — they arrive that way from the service, and
   * re-sorting by usage would make the row rearrange itself as work is tagged.
   */
  const { home, rest } = useMemo(() => {
    const needle = tagKey(trimmed)
    const matching = needle
      ? library.filter((tag) => tagKey(tag.name).includes(needle))
      : [...library]

    if (homeFolderId === null) return { home: [], rest: matching }

    return {
      home: matching.filter((tag) => tag.folderId === homeFolderId),
      rest: matching.filter((tag) => tag.folderId !== homeFolderId)
    }
  }, [library, trimmed, homeFolderId])

  const verdict = validateTagName(trimmed)
  // Offered only when nothing already answers to the name, case regardless —
  // otherwise "create Deep" would sit above the Deep the operator wants.
  const exists = library.some((tag) => tagKey(tag.name) === tagKey(trimmed))
  const canCreate = trimmed.length > 0 && verdict.ok && !exists

  const create = (): void => {
    if (!canCreate) return
    onCreate(trimmed, colour)
    setQuery('')
    // The colour is cleared with the name. A swatch left selected would
    // silently apply to the *next* tag typed, which is not what picking a
    // colour for "140" was meant to mean.
    setColour(null)
  }

  const group = (heading: string, entries: readonly TagSummary[]): ReactNode =>
    entries.length === 0 ? null : (
      <div className={styles.group}>
        <span className={styles.groupLabel}>{heading}</span>
        <div className={styles.groupBody}>
          {entries.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className={styles.option}
              style={{ '--tag-colour': tag.colour } as CSSProperties}
              data-on={carried.has(tag.id) || undefined}
              disabled={busy}
              onClick={() => onToggle(tag.id, !carried.has(tag.id))}
            >
              <span className={styles.optionDot} aria-hidden="true" />
              <span className={styles.optionName}>{tag.name}</span>
              <span className={styles.optionCount}>{tag.usageCount}</span>
            </button>
          ))}
        </div>
      </div>
    )

  return (
    <div className={styles.picker}>
      {/*
        Actions only — no heading of its own. The picker sits in a panel
        already labelled TAGS, and a second caption inside it was naming the
        same thing twice.
      */}
      <div className={styles.pickerHead}>
        {/*
          The same control as ADD TAG beside it, and drawn with the same
          primitive. It was a hand-rolled box that happened to look close —
          close enough to read as an inconsistency rather than as a
          distinction, since the two do equally weighted things.
        */}
        {library.length > 0 ? (
          <Button size="sm" icon={<ArchiveGlyph name="index" />} onClick={onManage}>
            Manage
          </Button>
        ) : null}
        <Button
          size="sm"
          icon={<ArchiveGlyph name={open ? 'cross' : 'plus'} />}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Done' : 'Add tag'}
        </Button>
      </div>

      {tags.length === 0 ? (
        <p className={styles.empty}>
          No tags on this project. Tags are what the folder tree cannot say — a track is filed in
          one place, but it can be <em>140</em>, <em>Deep</em> and <em>Dark</em> at once.
        </p>
      ) : (
        <div className={styles.chipRow}>
          {tags.map((tag) => (
            <TagChip
              key={tag.id}
              tag={tag}
              disabled={busy}
              onRemove={() => onToggle(tag.id, false)}
            />
          ))}
        </div>
      )}

      {open ? (
        <div className={styles.pickerBody}>
          <input
            type="text"
            className={styles.search}
            value={query}
            autoFocus
            maxLength={MAX_TAG_NAME_LENGTH}
            placeholder="Find a tag, or type a new one"
            aria-label="Find or create a tag"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                create()
              }
              // Escape closes the list, not the dossier behind it.
              if (event.key === 'Escape') {
                event.stopPropagation()
                setOpen(false)
              }
            }}
          />

          {trimmed.length > 0 && !verdict.ok ? (
            <p className={styles.hint}>{verdict.reason}</p>
          ) : null}

          {canCreate ? (
            <div className={styles.createRow}>
              <button type="button" className={styles.create} disabled={busy} onClick={create}>
                Create <span className={styles.createName}>{trimmed}</span>
                {homeFolderName ? (
                  <span className={styles.createWhere}>in {homeFolderName}</span>
                ) : null}
              </button>

              {/*
                Eight swatches and an ANY. Sited beside the create button
                rather than behind a second step, because the colour is only
                worth choosing at the moment the name is typed — afterwards
                the operator is looking at a chip and can recolour it from the
                library, which is where the full palette lives.
              */}
              <div className={styles.swatchRow} role="group" aria-label="Tag colour">
                <button
                  type="button"
                  className={styles.swatchAny}
                  data-selected={colour === null || undefined}
                  aria-pressed={colour === null}
                  {...tooltipTrigger('Pick a colour at random')}
                  onClick={() => setColour(null)}
                >
                  ANY
                </button>
                {TAG_SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    className={styles.swatch}
                    style={{ '--tag-colour': hex } as CSSProperties}
                    data-selected={colour === hex || undefined}
                    aria-pressed={colour === hex}
                    aria-label={`Colour ${hex}`}
                    {...tooltipTrigger(hex)}
                    onClick={() => setColour(hex)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className={styles.options}>
            {group(homeFolderName ? homeFolderName.toUpperCase() : 'THIS SHELF', home)}
            {group(home.length > 0 ? 'EVERYTHING ELSE' : 'ALL TAGS', rest)}

            {home.length === 0 && rest.length === 0 && !canCreate ? (
              <p className={styles.empty}>
                {library.length === 0
                  ? 'No tags yet. Type a name above to make the first one.'
                  : 'No tag matches that.'}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
