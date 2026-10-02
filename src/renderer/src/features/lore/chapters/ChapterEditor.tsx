import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  planetLook,
  type ChapterDraft,
  type LoreChapterView,
  type LoreState,
  type PublishedChapter
} from '@shared/domain/lore'
import {
  CHAPTER_STATUS_LABEL,
  LORE_LIMITS,
  SLUG_PATTERN,
  slugify,
  type WriteView
} from '@shared/domain/lore.constants'
import { PlanetSvg } from '@shared/planets/react'
import { useSystemStore } from '@renderer/app/store/system.store'
import { Button } from '@renderer/components/primitives/Button'
import { Dialog } from '@renderer/components/primitives/Dialog'
import { TextInput } from '@renderer/components/primitives/Input'
import type { LoreActions } from '@renderer/hooks/useLore'
import { parseMarkdownBlocks } from '@renderer/lib/markdown/blocks'
import { Segmented } from '../components/Controls'
import { PlanetPicker, PublishConflictDialog } from '../components/Planets'
import { clearBackup, readBackup, writeBackup } from '../lib/backup'
import { formatRelative, timeOf, whoLabel } from '../lib/format'
import { FormatBar } from './FormatBar'
import { useMarkdownEditing } from './useMarkdownEditing'
import { LorePreview } from './LorePreview'
import styles from '../Lore.module.scss'

interface Fields {
  title: string
  line: string
  slug: string
  planetId: string
  body: string
}

const FIELD_KEYS: ReadonlyArray<keyof Fields> = ['title', 'line', 'slug', 'planetId', 'body']

/** What's on file for a chapter: its draft here, or what the website has. */
function fieldsOf(view: LoreChapterView): Fields {
  const source = view.draft ?? view.published
  return {
    title: source?.title ?? '',
    line: source?.line ?? '',
    slug: source?.slug ?? '',
    planetId: source?.planetId ?? 'preset:network',
    body: source?.body ?? ''
  }
}

const same = (a: Fields, b: Fields): boolean => FIELD_KEYS.every((key) => a[key] === b[key])

function asFields(value: unknown): Fields | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (!FIELD_KEYS.every((key) => typeof raw[key] === 'string')) return null
  return raw as unknown as Fields
}

type Confirming = 'publish-live' | 'unpublish' | 'delete' | 'revert' | null

const VIEWS: ReadonlyArray<{ value: WriteView; label: string }> = [
  { value: 'write', label: 'Write' },
  { value: 'split', label: 'Side by side' },
  { value: 'preview', label: 'Preview' }
]

/**
 * One chapter, being written.
 *
 * Three ways to look at it: the text alone (Write), the text beside the
 * chapter as the website will show it (Side by side), or that alone
 * (Preview), drawn by the same reader the website uses. The text is
 * markdown, with a word processor's bar over it for whoever would rather
 * press a button than type a mark. Saved here,
 * on this PC, through the console's unsaved-changes bar, as COLOPHON and
 * REGULATION are; nothing leaves the PC until Publish, which saves first
 * when there is anything unsaved. A chapter only the website has (the other
 * person's) opens as published, and becomes a draft here when it's saved.
 *
 * What's typed and not saved yet is also kept in this window's storage, so
 * a crash or a closed window doesn't take it; it comes back marked
 * Restored. See lib/backup.
 */
export function ChapterEditor({
  view,
  state,
  numeral,
  actions,
  onDeleted,
  mode,
  onMode,
  picker
}: {
  view: LoreChapterView
  state: LoreState
  numeral: string
  actions: LoreActions
  onDeleted: () => void
  mode: WriteView
  onMode: (mode: WriteView) => void
  /** Choosing another chapter, drawn at the start of the editor's top bar. */
  picker: ReactNode
}): ReactNode {
  const backupKey = `lore-chapter:${view.id}`
  const base = fieldsOf(view)
  const [restored] = useState(() => {
    const backup = asFields(readBackup(backupKey))
    return backup && !same(backup, base) ? backup : null
  })
  const [fields, setFields] = useState<Fields>(() => restored ?? base)
  const dirty = !same(fields, base)

  // What's on file changed under the page: a save, a fetch that brought a
  // newer published version, or taking theirs after a clash. With nothing
  // unsaved here, the page follows. Adjusted while rendering, as the rail
  // adjusts its open division.
  const [previousBase, setPreviousBase] = useState(base)
  if (!same(previousBase, base)) {
    setPreviousBase(base)
    if (same(fields, previousBase)) setFields(base)
  }

  useEffect(() => {
    if (!dirty) {
      clearBackup(backupKey)
      return
    }
    const timer = window.setTimeout(() => writeBackup(backupKey, fields), 400)
    return () => window.clearTimeout(timer)
  }, [dirty, fields, backupKey])

  const set = (patch: Partial<Fields>): void => setFields((current) => ({ ...current, ...patch }))
  const textRef = useRef<HTMLTextAreaElement>(null)
  const editing = useMarkdownEditing(textRef, fields.body, (body) => set({ body }))
  // A change of view draws a new text box, with its own caret.
  const { onSelect: syncFormatting } = editing
  useEffect(() => syncFormatting(), [mode, syncFormatting])

  const parsed = useMemo(() => {
    try {
      return { blocks: parseMarkdownBlocks(fields.body, 'The text'), error: null }
    } catch (error) {
      return { blocks: [], error: error instanceof Error ? error.message : String(error) }
    }
  }, [fields.body])

  // The other person's planet, before this chapter's first save here brings
  // it into the library, is drawn from the copy the website keeps.
  const published = view.published
  const look =
    planetLook(state, fields.planetId) ??
    (published && published.planetId === fields.planetId
      ? { name: published.planetName || 'From the website', spec: published.planet }
      : null)
  const isPublished = published !== null
  const status = dirty && view.status === 'published' ? 'changed' : view.status
  const slugProblem = !fields.slug.trim()
    ? 'A chapter needs an address.'
    : !SLUG_PATTERN.test(fields.slug)
      ? 'Lowercase letters and numbers, joined by dashes.'
      : null

  // --------------------------------------------------------------- writing

  const [conflict, setConflict] = useState<{ current: PublishedChapter | null } | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [picking, setPicking] = useState(false)
  const [confirming, setConfirming] = useState<Confirming>(null)

  const draftOf = (): ChapterDraft => ({
    title: fields.title.trim(),
    line: fields.line.trim(),
    slug: fields.slug.trim() || undefined,
    planetId: fields.planetId,
    body: fields.body
  })

  /**
   * Saves here. True when it was. The page then shows what was kept, which
   * is trimmed (and given an address when it had none), so nothing reads as
   * unsaved after; unless more was typed while it saved.
   */
  const save = async (): Promise<boolean> => {
    const sent = fields
    const saved = await actions.saveChapter({ id: view.id, draft: draftOf() })
    if (!saved) return false
    clearBackup(backupKey)
    const kept = saved.drafts.find((draft) => draft.id === view.id)
    if (kept) {
      setFields((current) =>
        same(current, sent)
          ? {
              title: kept.title,
              line: kept.line,
              slug: kept.slug,
              planetId: kept.planetId,
              body: kept.body
            }
          : current
      )
    }
    return true
  }

  const discard = (): void => {
    setFields(base)
    clearBackup(backupKey)
  }

  const publish = async (force = false): Promise<void> => {
    setPublishing(true)
    try {
      if (dirty && !(await save())) return
      const result = await actions.publish({ id: view.id, force })
      if (result?.status === 'conflict') setConflict({ current: result.current })
    } finally {
      setPublishing(false)
    }
  }

  // The console's unsaved-changes bar saves and discards this chapter. The
  // latest save and discard are read through a ref, so the bar isn't told
  // about a new controller on every keystroke.
  const setUnsaved = useSystemStore((s) => s.setUnsaved)
  const latest = useRef({ save, discard })
  useEffect(() => {
    latest.current = { save, discard }
  })
  const saving = actions.pending === 'save-chapter'
  const subject = `the chapter "${fields.title.trim() || 'Untitled'}"`
  useEffect(() => {
    setUnsaved({
      dirty,
      saving,
      error: null,
      subject,
      save: () => void latest.current.save(),
      discard: () => latest.current.discard()
    })
  }, [dirty, saving, subject, setUnsaved])
  useEffect(() => () => setUnsaved(null), [setUnsaved])

  const problem = parsed.error
    ? 'Fix the text first.'
    : !fields.title.trim()
      ? 'Give it a title first.'
      : !fields.line.trim()
        ? 'Give it its one line first.'
        : !parsed.blocks.length
          ? 'Write some text first.'
          : slugProblem
            ? 'Fix the address first.'
            : !look
              ? 'Pick a planet first.'
              : null
  const publishLabel = dirty
    ? 'Save and publish'
    : status === 'draft'
      ? 'Publish'
      : status === 'changed'
        ? 'Publish changes'
        : 'Published'
  const live = state.site?.live ?? false
  const savedAt = timeOf(view.draft?.updatedAt ?? '')
  const publishedAt = timeOf(published?.publishedAt ?? '')

  const remove = (everywhere: boolean): void => {
    void actions.deleteChapter({ id: view.id, everywhere }).then((done) => {
      setConfirming(null)
      if (!done) return
      clearBackup(backupKey)
      if (everywhere || !isPublished) onDeleted()
    })
  }

  const textBox = (
    <div className={styles.writeColumn}>
      <FormatBar editing={editing} text={fields.body} limit={LORE_LIMITS.body} />
      <textarea
        ref={textRef}
        className={styles.markdown}
        value={fields.body}
        maxLength={LORE_LIMITS.body}
        spellCheck
        aria-label="The chapter's text"
        aria-invalid={parsed.error ? true : undefined}
        placeholder={
          'Start writing. Enter starts a new paragraph.\n\nUse the bar above for bold, italic, headings, lists, terms and large quotes.'
        }
        onChange={(event) => set({ body: event.target.value })}
        onKeyDown={editing.onKeyDown}
        onSelect={editing.onSelect}
      />
      {parsed.error ? <p className={styles.error}>{parsed.error}</p> : null}
    </div>
  )
  const preview = (
    <div className={styles.writeColumn}>
      {mode === 'split' ? (
        <div className={styles.columnHead}>
          <span className={styles.sectionLabel}>As the website shows it</span>
        </div>
      ) : null}
      <LorePreview
        numeral={numeral}
        title={fields.title}
        line={fields.line}
        planet={look?.spec ?? null}
        blocks={parsed.blocks}
      />
    </div>
  )

  return (
    <div className={styles.editor}>
      <div className={styles.editorTop}>
        {picker}
        <span className={styles.status} data-status={status}>
          {dirty ? 'UNSAVED' : status === 'changed' ? 'CHANGED' : CHAPTER_STATUS_LABEL[status]}
        </span>
        <span className={styles.spacer} />
        <Segmented label="View" value={mode} options={VIEWS} onChange={onMode} />
      </div>

      {restored && dirty ? (
        <p className={styles.notice}>
          <span className={styles.noticeLabel}>Restored</span>
          What you were writing before, which was never saved. Save it, or discard to go back to the
          saved version.
        </p>
      ) : null}

      <div className={styles.fields}>
        <TextInput
          label="Title"
          value={fields.title}
          onChange={(title) => set({ title })}
          maxLength={LORE_LIMITS.title}
          invalid={!fields.title.trim()}
          hint={!fields.title.trim() ? 'A chapter needs a title.' : undefined}
        />
        <TextInput
          label="One line"
          value={fields.line}
          onChange={(line) => set({ line })}
          maxLength={LORE_LIMITS.line}
          placeholder="Shown under the title, and on the orbit"
        />
        <TextInput
          label="Address"
          value={fields.slug}
          onChange={(slug) => set({ slug })}
          mono
          maxLength={LORE_LIMITS.slug}
          disabled={isPublished}
          invalid={Boolean(slugProblem)}
          hint={
            isPublished
              ? 'Fixed while it is published, so links to it keep working.'
              : (slugProblem ?? `candy-heist.com/lore/${fields.slug}`)
          }
          aside={
            isPublished ? null : (
              <button
                type="button"
                className={styles.quiet}
                onClick={() => set({ slug: slugify(fields.title) })}
                disabled={!fields.title.trim()}
              >
                Match the title
              </button>
            )
          }
        />
        <div className={styles.control}>
          <span className={styles.controlLabel}>Planet</span>
          <div className={styles.planetField}>
            {look ? <PlanetSvg className={styles.planetThumb} spec={look.spec} still /> : null}
            <span className={styles.planetName}>
              <span className={styles.planetNameText}>
                {look?.name ?? 'Not in the library any more'}
              </span>
              <span className={styles.footnote}>
                {fields.planetId.startsWith('preset:')
                  ? 'Preset'
                  : planetLook(state, fields.planetId)
                    ? 'From your planets'
                    : 'From the website; joins your planets when saved'}
              </span>
            </span>
            <span className={styles.spacer} />
            <Button size="sm" onClick={() => setPicking(true)}>
              Change
            </Button>
          </div>
        </div>
      </div>

      {mode === 'split' ? (
        <div className={styles.writing}>
          {textBox}
          {preview}
        </div>
      ) : (
        <div className={styles.single}>{mode === 'write' ? textBox : preview}</div>
      )}

      <div className={styles.meta}>
        <span>
          {view.draft
            ? `Saved on this PC${savedAt ? ` ${formatRelative(savedAt)}` : ''}`
            : 'Not saved on this PC: shown as the website has it'}
        </span>
        <span>
          {published
            ? `Published${publishedAt ? ` ${formatRelative(publishedAt)}` : ''}${
                published.publishedBy ? ` by ${whoLabel(published.publishedBy)}` : ''
              }`
            : 'Not on the website'}
        </span>
      </div>

      <div className={styles.editorActions}>
        <Button
          variant="primary"
          size="sm"
          disabled={Boolean(problem) || (status === 'published' && !dirty)}
          busy={publishing}
          onClick={() => (live ? void publish() : setConfirming('publish-live'))}
        >
          {publishLabel}
        </Button>
        {problem && (dirty || status !== 'published') ? (
          <span className={styles.footnote}>{problem}</span>
        ) : null}
        <span className={styles.spacer} />
        {confirming === 'unpublish' ? (
          <>
            <span className={styles.confirmText}>
              Take it off the website? The draft stays here.
            </span>
            <Button
              size="sm"
              variant="danger"
              busy={actions.pending === 'unpublish'}
              onClick={() => void actions.unpublish(view.id).then(() => setConfirming(null))}
            >
              Unpublish
            </Button>
            <Button size="sm" onClick={() => setConfirming(null)}>
              Keep it
            </Button>
          </>
        ) : confirming === 'revert' ? (
          <>
            <span className={styles.confirmText}>
              Drop the changes saved here and go back to what&apos;s published?
            </span>
            <Button
              size="sm"
              variant="danger"
              busy={actions.pending === 'delete-chapter'}
              onClick={() => remove(false)}
            >
              Revert
            </Button>
            <Button size="sm" onClick={() => setConfirming(null)}>
              Keep them
            </Button>
          </>
        ) : confirming === 'delete' ? (
          <>
            <span className={styles.confirmText}>
              {isPublished
                ? 'Take it off the website and delete it here?'
                : 'Delete this draft? It is only on this PC.'}
            </span>
            <Button
              size="sm"
              variant="danger"
              busy={actions.pending === 'delete-chapter'}
              onClick={() => remove(isPublished)}
            >
              Delete
            </Button>
            <Button size="sm" onClick={() => setConfirming(null)}>
              Keep it
            </Button>
          </>
        ) : (
          <>
            {view.status === 'changed' && view.draft ? (
              <Button size="sm" onClick={() => setConfirming('revert')}>
                Revert to published
              </Button>
            ) : null}
            {isPublished ? (
              <Button size="sm" onClick={() => setConfirming('unpublish')}>
                Unpublish
              </Button>
            ) : null}
            <Button size="sm" onClick={() => setConfirming('delete')}>
              {isPublished ? 'Delete everywhere' : 'Delete'}
            </Button>
          </>
        )}
      </div>

      {picking ? (
        <PlanetPicker
          state={state}
          value={fields.planetId}
          onCancel={() => setPicking(false)}
          onPick={(planetId) => {
            set({ planetId })
            setPicking(false)
          }}
        />
      ) : null}

      {confirming === 'publish-live' ? (
        <Dialog
          title="This replaces the website's lore"
          subtitle="The first chapter published from here switches the website over."
          confirmLabel={dirty ? 'Save and publish' : 'Publish'}
          canConfirm
          busy={publishing}
          onConfirm={() => {
            setConfirming(null)
            void publish()
          }}
          onCancel={() => setConfirming(null)}
        >
          <div className={styles.conflict}>
            <p>
              Until now the website reads the lore from its own files. From this publish on, it
              shows only the chapters published from here, so it shows this one chapter until the
              others are published too.
            </p>
          </div>
        </Dialog>
      ) : null}

      {conflict ? (
        <PublishConflictDialog
          current={conflict.current}
          busy={publishing || actions.pending === 'delete-chapter'}
          onCancel={() => setConflict(null)}
          onTakeTheirs={() => {
            setConflict(null)
            void actions.deleteChapter({ id: view.id, everywhere: false }).then((done) => {
              if (done) clearBackup(backupKey)
            })
          }}
          onOverwrite={() => {
            setConflict(null)
            void publish(true)
          }}
        />
      ) : null}
    </div>
  )
}
