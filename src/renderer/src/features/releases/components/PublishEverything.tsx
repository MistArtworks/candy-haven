import { useState, type ReactNode } from 'react'
import type { ReleaseEntry, ReleasesState } from '@shared/domain/releases'
import { Button } from '@renderer/components/primitives/Button'
import { Dialog } from '@renderer/components/primitives/Dialog'
import { Panel } from '@renderer/components/primitives/Panel'
import { Plate } from '@renderer/components/primitives/Plate'
import { RELEASE_KIND_LABEL } from '@shared/domain/discography.constants'
import { hostOfWebsite, isOut, metaOf } from '../lib/present'
import styles from '../ReleasesPage.module.scss'

/**
 * Before the website shows these releases: what "Publish everything" will
 * send, what visitors will see of it, and what can't go yet and why.
 */
export function PublishEverything({
  state,
  busy,
  onPublish
}: {
  state: ReleasesState
  busy: boolean
  onPublish: () => void
}): ReactNode {
  const [asking, setAsking] = useState(false)
  const sendable = state.entries.filter((entry) => entry.send !== 'problem')
  // Out, or announced: visitors see these. Drafts go too, hidden.
  const out = sendable.filter((entry) => isOut(entry) || entry.status === 'scheduled')
  const later = sendable.filter((entry) => !isOut(entry) && entry.status !== 'scheduled')
  const blocked = state.entries.filter((entry) => entry.send === 'problem')
  const fetched = state.site !== null
  const host = hostOfWebsite(state.link.website)

  return (
    <Panel label="Publish everything" index="01" focal className={styles.publishPanel}>
      <div className={styles.publish}>
        <p className={styles.lead}>
          {host} still shows its own releases. Publishing everything sends the releases in
          DISCOGRAPHY to it, once, and the website shows only these from then on. After that, a
          release goes again whenever its sheet in DISCOGRAPHY is done with.
        </p>

        <p className={styles.note}>
          Each cover goes too, shrunk to 750×750 here and compressed on the website. A release
          without one shows the placeholder.
        </p>

        <div className={styles.actions}>
          <Button
            variant="primary"
            busy={busy}
            disabled={!fetched || !sendable.length}
            onClick={() => setAsking(true)}
          >
            Publish everything
          </Button>
          {!fetched ? (
            <span className={styles.note}>Fetching what the website has first…</span>
          ) : null}
        </div>

        <Group
          group="shown"
          label="Shown on the website"
          hint="Out already, or scheduled, so visitors see these as soon as they're sent."
          entries={out}
        />
        <Group
          group="hidden"
          label="Drafts, kept hidden"
          hint="Not out yet. They go too, but stay hidden until they're scheduled (Show) or their release day comes."
          entries={later}
        />
        <Group
          group="blocked"
          label="Can't go yet"
          hint="These stay here until they're fixed in DISCOGRAPHY."
          entries={blocked}
        />
      </div>

      {asking ? (
        <Dialog
          title="Publish everything?"
          subtitle={`To ${host}`}
          confirmLabel={`Publish ${sendable.length}`}
          canConfirm={!busy}
          busy={busy}
          footnote="The website switches over for good: its own releases are not shown again."
          onConfirm={() => {
            setAsking(false)
            onPublish()
          }}
          onCancel={() => setAsking(false)}
        >
          <p className={styles.dialogText}>
            {sendable.length} release{sendable.length === 1 ? '' : 's'} go to the website.{' '}
            {out.length} {out.length === 1 ? 'is' : 'are'} out or scheduled and show straight away;
            the drafts stay hidden until they&apos;re scheduled or their day comes.
            {blocked.length
              ? ` ${blocked.length} can't go yet and stay here until they're fixed in DISCOGRAPHY.`
              : ''}
          </p>
        </Dialog>
      ) : null}
    </Panel>
  )
}

/** One part of what Publish everything does, release by release. */
function Group({
  group,
  label,
  hint,
  entries
}: {
  group: 'shown' | 'hidden' | 'blocked'
  label: string
  hint: string
  entries: ReleaseEntry[]
}): ReactNode {
  if (!entries.length) return null
  return (
    <section className={styles.preview} data-group={group} aria-label={label}>
      <div className={styles.previewHead}>
        <span className={styles.previewLabel}>{label}</span>
        <span className={styles.previewCount}>{entries.length}</span>
      </div>
      <p className={styles.previewHint}>{hint}</p>
      <ul className={styles.previewList}>
        {entries.map((entry) => (
          <li key={entry.id}>
            <Plate
              path={entry.artworkPath}
              fallback={RELEASE_KIND_LABEL[entry.kind].slice(0, 2)}
              size={40}
              alt=""
            />
            <span className={styles.previewText}>
              <span className={styles.previewTitle}>{entry.title || 'Untitled'}</span>
              <span className={styles.previewMeta}>
                {metaOf(entry.kind, entry.date, entry.trackCount)}
              </span>
              {entry.problem ? <span className={styles.previewWhy}>{entry.problem}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
