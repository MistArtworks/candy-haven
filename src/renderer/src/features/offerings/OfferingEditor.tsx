import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  offeringProblems,
  offeringStatus,
  type Offering,
  type OfferingDraft,
  type OfferingFact,
  type OfferingsState
} from '@shared/domain/offerings'
import {
  OFFERING_ICONS,
  OFFERING_ICON_LABEL,
  OFFERING_KINDS,
  OFFERING_KIND_LABEL,
  OFFERING_LIMITS,
  OFFERING_STATUS_LABEL,
  SESSION_LENGTHS,
  SLUG_PATTERN,
  slugify,
  type OfferingIcon,
  type OfferingKind
} from '@shared/domain/offerings.constants'
import type { WriteView } from '@shared/domain/lore.constants'
import { useSystemStore } from '@renderer/app/store/system.store'
import { Button } from '@renderer/components/primitives/Button'
import { SelectInput, TextInput } from '@renderer/components/primitives/Input'
import { Toggle } from '@renderer/components/primitives/Toggle'
import type { OfferingsActions } from '@renderer/hooks/useOfferings'
import { parseMarkdownBlocks } from '@renderer/lib/markdown/blocks'
import { Segmented } from '@renderer/features/lore/components/Controls'
import { FormatBar } from '@renderer/features/lore/chapters/FormatBar'
import { useMarkdownEditing } from '@renderer/features/lore/chapters/useMarkdownEditing'
import { PreviewBlocks } from '@renderer/features/lore/chapters/LorePreview'
import { formatRelative, timeOf } from '@renderer/features/lore/lib/format'
import lore from '@renderer/features/lore/Lore.module.scss'
import { PhotoField } from './PhotoField'
import styles from './Offerings.module.scss'

interface Fields {
  slug: string
  kind: OfferingKind
  name: string
  icon: OfferingIcon
  summary: string
  /** As typed: dollars, or empty for none. */
  price: string
  durationMinutes: number | null
  facts: OfferingFact[]
  body: string
  alt: string
  shown: boolean
}

function fieldsOf(offering: Offering): Fields {
  return {
    slug: offering.slug,
    kind: offering.kind,
    name: offering.name,
    icon: offering.icon,
    summary: offering.summary,
    price: offering.price === null ? '' : String(offering.price),
    durationMinutes: offering.durationMinutes,
    facts: offering.facts.map((fact) => ({ ...fact })),
    body: offering.body,
    alt: offering.photo.alt,
    shown: offering.shown
  }
}

const same = (a: Fields, b: Fields): boolean => JSON.stringify(a) === JSON.stringify(b)

/** A price as typed, in dollars: `1,200.50` is 1200.5. Null for none; NaN for something else. */
function priceOf(typed: string): number | null {
  const value = typed.replace(/[\s,$]/g, '')
  if (!value) return null
  return /^\d+(\.\d{1,2})?$/.test(value) ? Number(value) : Number.NaN
}

const VIEWS: ReadonlyArray<{ value: WriteView; label: string }> = [
  { value: 'write', label: 'Write' },
  { value: 'split', label: 'Side by side' },
  { value: 'preview', label: 'Preview' }
]

const KIND_OPTIONS = OFFERING_KINDS.map((kind) => ({
  value: kind,
  label: OFFERING_KIND_LABEL[kind]
}))
const ICON_OPTIONS = OFFERING_ICONS.map((icon) => ({
  value: icon,
  label: OFFERING_ICON_LABEL[icon]
}))

/** `60 min`, `1 h 30 min`. */
function lengthLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest} min`
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

const LENGTH_OPTIONS = SESSION_LENGTHS.map((minutes) => ({
  value: String(minutes),
  label: lengthLabel(minutes)
}))

/**
 * One service, being written: its name, kind and price, what the cards and
 * the summary show of it (its line, its glyph, its facts), its photo, and
 * its write-up, in the website's markdown with LORE's bar over it.
 *
 * Saved here, on this PC, through the console's unsaved-changes bar, as
 * LORE's chapters are; nothing reaches the website until Publish, which
 * sends the whole list. The photo is the exception to the bar: a picked one
 * is copied in at once (it's a file, not typing), and still goes to the
 * website only with the next publish.
 */
export function OfferingEditor({
  offering,
  state,
  actions,
  onDeleted
}: {
  offering: Offering
  state: OfferingsState
  actions: OfferingsActions
  onDeleted: () => void
}): ReactNode {
  const base = fieldsOf(offering)
  const [fields, setFields] = useState<Fields>(base)
  const dirty = !same(fields, base)
  const [mode, setMode] = useState<WriteView>('split')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // What's on file changed under the page (a save, a photo, taking theirs):
  // with nothing unsaved here, the page follows.
  const [previousBase, setPreviousBase] = useState(base)
  if (!same(previousBase, base)) {
    setPreviousBase(base)
    if (same(fields, previousBase)) setFields(base)
  }

  const set = (patch: Partial<Fields>): void => setFields((current) => ({ ...current, ...patch }))
  const textRef = useRef<HTMLTextAreaElement>(null)
  const editing = useMarkdownEditing(textRef, fields.body, (body) => set({ body }))
  const { onSelect: syncFormatting } = editing
  useEffect(() => syncFormatting(), [mode, syncFormatting])

  const parsed = useMemo(() => {
    try {
      return { blocks: parseMarkdownBlocks(fields.body, 'The write-up'), error: null }
    } catch (error) {
      return { blocks: [], error: error instanceof Error ? error.message : String(error) }
    }
  }, [fields.body])

  const price = priceOf(fields.price)
  const published = Boolean(state.base?.sent[offering.id])
  const status = offeringStatus(offering, state.base)
  const shownStatus = dirty ? 'UNSAVED' : OFFERING_STATUS_LABEL[status]

  // What would stop it going, from what's typed now.
  const typed: Offering = {
    ...offering,
    slug: fields.slug.trim(),
    kind: fields.kind,
    name: fields.name,
    icon: fields.icon,
    summary: fields.summary,
    price: Number.isNaN(price) ? null : price,
    durationMinutes: fields.kind === 'session' ? fields.durationMinutes : null,
    facts: fields.facts,
    body: fields.body,
    photo: { ...offering.photo, alt: fields.alt },
    shown: fields.shown
  }
  const problems = [
    ...(Number.isNaN(price) ? ['A price is in dollars and cents, like 120 or 89.50.'] : []),
    ...(parsed.error ? [parsed.error] : []),
    ...offeringProblems(typed)
  ]
  const slugProblem = !fields.slug.trim()
    ? 'A service needs an address.'
    : !SLUG_PATTERN.test(fields.slug.trim())
      ? 'Lowercase letters and numbers, joined by dashes.'
      : null

  const draftOf = (): OfferingDraft => ({
    slug: fields.slug.trim(),
    kind: fields.kind,
    name: fields.name.trim(),
    icon: fields.icon,
    summary: fields.summary.trim(),
    price: Number.isNaN(price) ? offering.price : price,
    durationMinutes: fields.kind === 'session' ? (fields.durationMinutes ?? 60) : null,
    facts: fields.facts.slice(0, OFFERING_LIMITS.facts),
    body: fields.body,
    alt: fields.alt.trim(),
    shown: fields.shown
  })

  const save = async (): Promise<boolean> => {
    if (Number.isNaN(price)) return false
    const sent = fields
    const saved = await actions.save({ id: offering.id, draft: draftOf() })
    if (!saved) return false
    const kept = saved.offerings.find((entry) => entry.id === offering.id)
    if (kept) setFields((current) => (same(current, sent) ? fieldsOf(kept) : current))
    return true
  }
  const discard = (): void => setFields(base)

  // The console's unsaved-changes bar saves and discards this service.
  const setUnsaved = useSystemStore((s) => s.setUnsaved)
  const latest = useRef({ save, discard })
  useEffect(() => {
    latest.current = { save, discard }
  })
  const saving = actions.pending === 'save'
  const subject = `the service "${fields.name.trim() || 'Untitled'}"`
  useEffect(() => {
    setUnsaved({
      dirty,
      saving,
      error: Number.isNaN(price) ? 'Fix the price first.' : null,
      subject,
      save: () => void latest.current.save(),
      discard: () => latest.current.discard()
    })
  }, [dirty, saving, subject, price, setUnsaved])
  useEffect(() => () => setUnsaved(null), [setUnsaved])

  const setFact = (index: number, patch: Partial<OfferingFact>): void =>
    set({ facts: fields.facts.map((fact, i) => (i === index ? { ...fact, ...patch } : fact)) })
  const moveFact = (index: number, by: -1 | 1): void => {
    const facts = [...fields.facts]
    const [fact] = facts.splice(index, 1)
    facts.splice(index + by, 0, fact)
    set({ facts })
  }

  const textBox = (
    <div className={lore.writeColumn}>
      <FormatBar editing={editing} text={fields.body} limit={OFFERING_LIMITS.body} />
      <textarea
        ref={textRef}
        className={lore.markdown}
        value={fields.body}
        maxLength={OFFERING_LIMITS.body}
        spellCheck
        aria-label="The service's write-up"
        aria-invalid={parsed.error ? true : undefined}
        placeholder={
          'What it is, what’s included, how it runs, what to have ready.\n\nUse the bar above for headings, lists, terms and bold.'
        }
        onChange={(event) => set({ body: event.target.value })}
        onKeyDown={editing.onKeyDown}
        onSelect={editing.onSelect}
      />
      {parsed.error ? <p className={lore.error}>{parsed.error}</p> : null}
    </div>
  )
  const preview = (
    <div className={lore.writeColumn}>
      {mode === 'split' ? (
        <div className={lore.columnHead}>
          <span className={lore.sectionLabel}>As the website shows it</span>
        </div>
      ) : null}
      <div className={lore.preview}>
        <div className={lore.previewBody}>
          {parsed.blocks.length ? (
            <PreviewBlocks blocks={parsed.blocks} />
          ) : (
            <p className={lore.footnote}>The write-up shows here as it&apos;s written.</p>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className={lore.editor}>
      <div className={lore.editorTop}>
        <span className={lore.status} data-status={dirty ? 'changed' : status}>
          {shownStatus}
        </span>
        <span className={lore.spacer} />
        <div className={lore.control}>
          <span className={lore.controlLabel}>Show it on the website</span>
          <Toggle
            label="Show it on the website"
            checked={fields.shown}
            tone="gold"
            onChange={(shown) => set({ shown })}
          />
        </div>
      </div>

      <div className={lore.fields}>
        <TextInput
          label="Name"
          value={fields.name}
          onChange={(name) => set({ name })}
          maxLength={OFFERING_LIMITS.name}
          invalid={!fields.name.trim()}
          hint={!fields.name.trim() ? 'A service needs a name.' : undefined}
        />
        <TextInput
          label="Address"
          value={fields.slug}
          onChange={(slug) => set({ slug })}
          mono
          maxLength={OFFERING_LIMITS.slug}
          disabled={published}
          invalid={Boolean(slugProblem)}
          hint={
            published
              ? 'Fixed once published, so links to it (and the home page’s list) keep working.'
              : (slugProblem ?? `/services/producer?service=${fields.slug.trim()}`)
          }
          aside={
            published ? null : (
              <button
                type="button"
                className={lore.quiet}
                onClick={() => set({ slug: slugify(fields.name) })}
                disabled={!fields.name.trim()}
              >
                Match the name
              </button>
            )
          }
        />
        <Segmented
          label="Kind"
          value={fields.kind}
          options={KIND_OPTIONS}
          onChange={(kind) =>
            set({
              kind,
              durationMinutes: kind === 'session' ? (fields.durationMinutes ?? 60) : null
            })
          }
        />
        <Segmented
          label="Glyph"
          value={fields.icon}
          options={ICON_OPTIONS}
          onChange={(icon) => set({ icon })}
        />
        <div className={styles.wholeRow}>
          <TextInput
            label="One line"
            value={fields.summary}
            onChange={(summary) => set({ summary })}
            maxLength={OFFERING_LIMITS.summary}
            placeholder="Under its name on its card: From first blend to full set."
          />
        </div>
        <TextInput
          label="Price, CAD"
          value={fields.price}
          onChange={(value) => set({ price: value })}
          mono
          placeholder="None yet"
          invalid={Number.isNaN(price)}
          hint={
            Number.isNaN(price)
              ? 'Dollars and cents, like 120 or 89.50.'
              : price === null
                ? 'Without a price it shows, but can’t be booked online.'
                : fields.kind === 'commission'
                  ? 'Half is paid when it’s booked, the other half on delivery.'
                  : 'Paid in full when it’s booked.'
          }
        />
        {fields.kind === 'session' ? (
          <SelectInput
            label="Length"
            value={String(fields.durationMinutes ?? 60)}
            options={LENGTH_OPTIONS}
            onChange={(value) => set({ durationMinutes: Number(value) })}
            hint="Each start time in HOURS is a session this long."
          />
        ) : (
          <span />
        )}
      </div>

      <div className={styles.facts}>
        <span className={lore.sectionLabel}>
          Facts, as label and value: the first sits in the summary
        </span>
        {fields.facts.map((fact, index) => (
          <div key={index} className={styles.fact}>
            <TextInput
              label="Label"
              value={fact.label}
              onChange={(label) => setFact(index, { label })}
              maxLength={OFFERING_LIMITS.factLabel}
              placeholder="Format"
            />
            <TextInput
              label="Value"
              value={fact.value}
              onChange={(value) => setFact(index, { value })}
              maxLength={OFFERING_LIMITS.factValue}
              placeholder="Per track"
            />
            <div className={styles.factTools}>
              <button
                type="button"
                className={styles.toolButton}
                aria-label="Move up"
                disabled={index === 0}
                onClick={() => moveFact(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className={styles.toolButton}
                aria-label="Move down"
                disabled={index === fields.facts.length - 1}
                onClick={() => moveFact(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className={styles.toolButton}
                aria-label="Remove"
                onClick={() => set({ facts: fields.facts.filter((_, i) => i !== index) })}
              >
                ×
              </button>
            </div>
          </div>
        ))}
        <div className={lore.actions}>
          <Button
            size="sm"
            disabled={fields.facts.length >= OFFERING_LIMITS.facts}
            onClick={() => set({ facts: [...fields.facts, { label: '', value: '' }] })}
          >
            Add a fact
          </Button>
        </div>
      </div>

      <PhotoField
        offering={offering}
        website={state.link.website}
        alt={fields.alt}
        onAlt={(alt) => set({ alt })}
        actions={actions}
      />

      <div className={lore.editorTop}>
        <span className={lore.sectionLabel}>The write-up</span>
        <span className={lore.spacer} />
        <Segmented label="View" value={mode} options={VIEWS} onChange={setMode} />
      </div>
      {mode === 'split' ? (
        <div className={lore.writing}>
          {textBox}
          {preview}
        </div>
      ) : (
        <div className={lore.single}>{mode === 'write' ? textBox : preview}</div>
      )}

      {problems.length && fields.shown ? (
        <ul className={styles.problems} aria-label="Before it can be published">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}

      <div className={lore.meta}>
        <span>
          Saved on this PC
          {timeOf(offering.updatedAt) ? ` ${formatRelative(timeOf(offering.updatedAt))}` : ''}
        </span>
        <span>
          {!fields.shown
            ? 'Kept here: not on the website'
            : published
              ? 'Published from here'
              : 'Not published from here yet'}
        </span>
      </div>

      <div className={lore.editorActions}>
        <span className={lore.spacer} />
        {confirmingDelete ? (
          <>
            <span className={lore.confirmText}>
              {published
                ? 'Delete it here? It comes off the website with the next publish.'
                : 'Delete this service? It is only on this PC.'}
            </span>
            <Button
              size="sm"
              variant="danger"
              busy={actions.pending === 'delete'}
              onClick={() =>
                void actions.remove(offering.id).then((done) => {
                  setConfirmingDelete(false)
                  if (done) {
                    setUnsaved(null)
                    onDeleted()
                  }
                })
              }
            >
              Delete
            </Button>
            <Button size="sm" onClick={() => setConfirmingDelete(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => setConfirmingDelete(true)}>
            Delete
          </Button>
        )}
      </div>
    </div>
  )
}
