import {
  useMemo,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction
} from 'react'
import { TARGET_KIND_LABEL, type Pin } from '@shared/domain/strip'
import { Button } from '@renderer/components/primitives/Button'
import { TextInput } from '@renderer/components/primitives/Input'
import { useProjectRegistry } from '@renderer/hooks/useProjects'
import { tooltipTrigger } from '@renderer/lib/tooltip'
import {
  MAX_ATTACHMENTS,
  describeTarget,
  linkPin,
  pathPin,
  projectPin,
  targetKey,
  useOpenAttachment
} from '../attachments'
import styles from '../CalendarPage.module.scss'

export interface AttachmentsFieldProps {
  value: readonly Pin[]
  /**
   * A state setter rather than a plain callback: a file is added after the
   * system dialog closes, and by then the list this field was drawn with may
   * not be the latest one.
   */
  onChange: Dispatch<SetStateAction<Pin[]>>
  disabled?: boolean
}

/** Projects listed at once in the picker; the search narrows the rest. */
const PICKER_ROWS = 8

/**
 * What the entry is about, opened from it in one click.
 *
 * Held in the dialog like every other field and filed with it, so an
 * attachment added and then cancelled out of was never attached.
 *
 * Every button here carries `data-enter="own"`, so Enter on one presses it
 * rather than filing the entry (see useDialogKeys).
 */
export function AttachmentsField({
  value,
  onChange,
  disabled = false
}: AttachmentsFieldProps): ReactNode {
  const [adding, setAdding] = useState<'project' | 'link' | null>(null)
  const [pickProblem, setPickProblem] = useState<string | null>(null)
  const { open, problem: openProblem, clear } = useOpenAttachment()

  const full = value.length >= MAX_ATTACHMENTS
  const attached = useMemo(() => new Set(value.map((pin) => targetKey(pin.target))), [value])

  // Checked against the latest list, not the one drawn, for the reason on
  // `onChange`. Attaching the same thing twice is quietly a no-op.
  const add = (pin: Pin): void => {
    onChange((current) =>
      current.length >= MAX_ATTACHMENTS ||
      current.some((held) => targetKey(held.target) === targetKey(pin.target))
        ? current
        : [...current, pin]
    )
  }

  const pickPath = (kind: 'file' | 'folder'): void => {
    setPickProblem(null)
    clear()
    const picking =
      kind === 'file'
        ? window.candy.shell.selectFile({ title: 'Attach a file' })
        : window.candy.shell.selectDirectory('Attach a folder')

    void picking
      .then((path) => {
        if (path) add(pathPin(kind, path))
      })
      .catch((cause: unknown) => {
        setPickProblem(cause instanceof Error ? cause.message : String(cause))
      })
  }

  const toggle = (next: 'project' | 'link'): void => {
    setPickProblem(null)
    setAdding((was) => (was === next ? null : next))
  }

  const problem = openProblem ?? pickProblem

  return (
    <div className={styles.field} role="group" aria-label="Attachments">
      <div className={styles.fieldHead}>
        <span className={styles.fieldLabel}>Attachments</span>
        {value.length > 0 ? (
          <span className={styles.fieldCount}>
            {value.length}/{MAX_ATTACHMENTS}
          </span>
        ) : null}
      </div>

      {value.length > 0 ? (
        <ul className={styles.pinList}>
          {value.map((pin) => (
            <li key={pin.id} className={styles.pinRow}>
              <span className={styles.pinKind}>{TARGET_KIND_LABEL[pin.target.kind]}</span>
              <span className={styles.pinLabel} {...tooltipTrigger(describeTarget(pin.target))}>
                {pin.label}
              </span>
              <button
                type="button"
                data-enter="own"
                className={styles.pinOpen}
                disabled={disabled}
                onClick={() => open(pin)}
              >
                Open
              </button>
              <button
                type="button"
                data-enter="own"
                className={styles.pinRemove}
                disabled={disabled}
                aria-label={`Remove ${pin.label}`}
                onClick={() => onChange((current) => current.filter((held) => held.id !== pin.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.fieldEmpty}>
          Nothing attached. A project, a file, a folder or a link opens from here in one click.
        </p>
      )}

      {/* At the cap the way to add goes, rather than a button that refuses. */}
      {!full ? (
        <div className={styles.pinAdd}>
          <Button size="sm" data-enter="own" disabled={disabled} onClick={() => pickPath('file')}>
            File…
          </Button>
          <Button size="sm" data-enter="own" disabled={disabled} onClick={() => pickPath('folder')}>
            Folder…
          </Button>
          <Button
            size="sm"
            data-enter="own"
            disabled={disabled}
            aria-expanded={adding === 'project'}
            data-active={adding === 'project' || undefined}
            className={styles.pinAddToggle}
            onClick={() => toggle('project')}
          >
            Project…
          </Button>
          <Button
            size="sm"
            data-enter="own"
            disabled={disabled}
            aria-expanded={adding === 'link'}
            data-active={adding === 'link' || undefined}
            className={styles.pinAddToggle}
            onClick={() => toggle('link')}
          >
            Link
          </Button>
        </div>
      ) : null}

      {!full && adding === 'project' ? (
        <ProjectPicker
          attached={attached}
          onPick={(pin) => {
            add(pin)
            setAdding(null)
          }}
          onCancel={() => setAdding(null)}
        />
      ) : null}

      {!full && adding === 'link' ? (
        <LinkEntry
          onAdd={(pin) => {
            add(pin)
            setAdding(null)
          }}
          onCancel={() => setAdding(null)}
        />
      ) : null}

      {problem ? <p className={styles.dialogError}>{problem}</p> : null}
    </div>
  )
}

/*
 * Escape closes the small panel it was pressed in, not the dialog.
 *
 * The dialog binds Escape on the document (useDialogKeys), and a press meant
 * for a search box would otherwise throw away everything typed into the entry.
 * Stopping it here keeps it from reaching the document at all.
 */
function escapeTo(onCancel: () => void): (event: KeyboardEvent<HTMLDivElement>) => void {
  return (event) => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    onCancel()
  }
}

/**
 * A project from the ARCHIVE, found by name.
 *
 * Every live project is fetched once and narrowed here. The register is local
 * and a few hundred names is nothing to filter in memory, where a query per
 * keystroke would go back to the archive for every letter.
 */
function ProjectPicker({
  attached,
  onPick,
  onCancel
}: {
  attached: ReadonlySet<string>
  onPick: (pin: Pin) => void
  onCancel: () => void
}): ReactNode {
  const [search, setSearch] = useState('')
  const { data, isLoading, isError } = useProjectRegistry({})

  const { matches, more } = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const projects = data?.projects ?? []
    const found = needle
      ? projects.filter((project) => project.name.toLowerCase().includes(needle))
      : projects
    return { matches: found.slice(0, PICKER_ROWS), more: Math.max(0, found.length - PICKER_ROWS) }
  }, [data, search])

  const isAttached = (projectId: string): boolean =>
    attached.has(targetKey({ kind: 'project', projectId }))

  // Enter takes the first project that can still be attached.
  const first = matches.find((project) => !isAttached(project.id))

  return (
    <div className={styles.picker} onKeyDown={escapeTo(onCancel)}>
      <TextInput
        label="Project"
        value={search}
        onChange={setSearch}
        placeholder="Search the archive by name"
        maxLength={80}
        onEnter={() => {
          if (first) onPick(projectPin(first.id, first.name))
        }}
      />

      {isLoading ? <p className={styles.fieldEmpty}>Reading the archive…</p> : null}
      {isError ? (
        <p className={styles.dialogError}>The archive could not be read. Is it attached?</p>
      ) : null}
      {data && matches.length === 0 ? (
        <p className={styles.fieldEmpty}>
          {search.trim() ? 'No project by that name.' : 'The archive holds no projects yet.'}
        </p>
      ) : null}

      {matches.length > 0 ? (
        <ul className={styles.pickerList}>
          {matches.map((project) => {
            const held = isAttached(project.id)
            return (
              <li key={project.id}>
                <button
                  type="button"
                  data-enter="own"
                  className={styles.pickerItem}
                  disabled={held}
                  onClick={() => onPick(projectPin(project.id, project.name))}
                >
                  <span className={styles.pickerName}>{project.name}</span>
                  {held ? <span className={styles.pickerNote}>Attached</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      <div className={styles.pickerFoot}>
        {more > 0 ? (
          <span className={styles.pickerNote}>{more} more; narrow the search</span>
        ) : null}
        <Button size="sm" data-enter="own" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

/** A web address, typed or pasted. */
function LinkEntry({
  onAdd,
  onCancel
}: {
  onAdd: (pin: Pin) => void
  onCancel: () => void
}): ReactNode {
  const [address, setAddress] = useState('')
  const [refused, setRefused] = useState(false)

  const commit = (): void => {
    const pin = linkPin(address)
    if (!pin) {
      setRefused(true)
      return
    }
    onAdd(pin)
  }

  return (
    <div className={styles.picker} onKeyDown={escapeTo(onCancel)}>
      <TextInput
        label="Address"
        value={address}
        onChange={(next) => {
          setAddress(next)
          setRefused(false)
        }}
        placeholder="https://"
        mono
        maxLength={2048}
        invalid={refused}
        hint={
          refused
            ? 'That is not a web address. Give it in full, starting http:// or https://.'
            : 'Opens in the browser. Named after its site; Enter adds it.'
        }
        onEnter={commit}
      />

      <div className={styles.pickerFoot}>
        <Button size="sm" data-enter="own" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" data-enter="own" disabled={!address.trim()} onClick={commit}>
          Add link
        </Button>
      </div>
    </div>
  )
}
