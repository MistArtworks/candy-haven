import { useState, type ReactNode } from 'react'
import { pendingChanges, type OfferingsState, type ServicesSite } from '@shared/domain/offerings'
import { useSystemStore } from '@renderer/app/store/system.store'
import { Button } from '@renderer/components/primitives/Button'
import { Dialog } from '@renderer/components/primitives/Dialog'
import { notify } from '@renderer/components/feedback/notify'
import type { OfferingsActions } from '@renderer/hooks/useOfferings'
import { formatRelative, timeOf, whoLabel } from '@renderer/features/lore/lib/format'
import lore from '@renderer/features/lore/Lore.module.scss'
import styles from './Offerings.module.scss'

/** Unsaved typing comes first: the unsaved-changes bar asks for a save or a discard. */
function guarded(go: () => void): void {
  const { unsaved, nudgeUnsaved } = useSystemStore.getState()
  if (unsaved?.dirty) {
    nudgeUnsaved()
    return
  }
  go()
}

/** `1 new, 2 changed and the hours`. */
function changesWords(changes: ReturnType<typeof pendingChanges>): string {
  const parts = [
    changes.added ? `${changes.added} new` : '',
    changes.changed ? `${changes.changed} changed` : '',
    changes.removed ? `${changes.removed} to take off` : '',
    changes.hours ? 'the hours' : '',
    changes.order ? 'the order' : ''
  ].filter(Boolean)
  if (parts.length < 2) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/**
 * Over OFFERINGS and HOURS: what the website has, what a publish would
 * change, and Publish, which sends the list and the hours together. The
 * first publish switches the website from its own list, so it asks first;
 * a publish refused because the other person published since asks too.
 */
export function PublishBar({
  state,
  actions
}: {
  state: OfferingsState
  actions: OfferingsActions
}): ReactNode {
  const [asking, setAsking] = useState<'first' | null>(null)
  const [conflict, setConflict] = useState<ServicesSite | null>(null)
  const changes = pendingChanges(state)
  const site = state.site
  const live = site?.live ?? false
  const elsewhere = Boolean(site && state.base && site.revision > state.base.revision)
  const publishing = state.working === 'publishing' || actions.pending === 'publish'
  const due = !live || changes.any || elsewhere

  const publishedBy = site?.publishedBy ? whoLabel(site.publishedBy) : ''
  const publishedAt = timeOf(site?.publishedAt ?? '')

  const [title, detail] = !site
    ? ['NOT FETCHED YET', 'Fetch what the website offers, to compare it with the list here.']
    : !live
      ? [
          'THE WEBSITE SHOWS ITS OWN LIST',
          'Publishing replaces it with the list here; from then on it shows only what is published from here.'
        ]
      : elsewhere
        ? [
            'PUBLISHED FROM THE OTHER COMPUTER',
            `The website has a newer list${publishedBy ? `, from ${publishedBy}` : ''}${publishedAt ? ` ${formatRelative(publishedAt)}` : ''}. Publishing asks before it goes over it.`
          ]
        : changes.any
          ? [
              'CHANGES TO PUBLISH',
              `${changesWords(changes) || 'The list'}, kept here until you publish.`
            ]
          : [
              'UP TO DATE',
              `The website offers what is here${publishedBy ? `, published by ${publishedBy}` : ''}${publishedAt ? ` ${formatRelative(publishedAt)}` : ''}.`
            ]

  const publish = async (force = false): Promise<void> => {
    const result = await actions.publish(force)
    if (!result) return
    if (result.status === 'conflict') {
      setConflict(result.current)
      return
    }
    notify.done('Published', {
      detail: 'The website shows the list and the hours on its next visit.'
    })
  }

  return (
    <div className={styles.publish} data-pending={due || undefined}>
      <div className={styles.publishText}>
        <span className={styles.publishTitle}>{title}</span>
        <p className={styles.publishDetail}>{detail}</p>
      </div>
      <div className={styles.publishActions}>
        <button
          type="button"
          className={lore.quiet}
          disabled={state.link.state === 'syncing'}
          onClick={() => void actions.sync()}
        >
          {state.link.state === 'syncing' ? 'Checking…' : 'Check the website'}
        </button>
        <Button
          variant="primary"
          size="sm"
          busy={publishing}
          disabled={!due || !state.offerings.length}
          onClick={() => guarded(() => (live ? void publish() : setAsking('first')))}
        >
          Publish
        </Button>
      </div>

      {asking === 'first' ? (
        <Dialog
          title="This replaces the website's services"
          subtitle="The first publish from here switches the website over."
          confirmLabel="Publish"
          canConfirm
          busy={publishing}
          onConfirm={() => {
            setAsking(null)
            void publish()
          }}
          onCancel={() => setAsking(null)}
        >
          <div className={lore.conflict}>
            <p>
              Until now the website offers the services in its own files. From this publish on, it
              offers only the services shown here, in this order, with the hours set here, and the
              home page lists them by their addresses.
            </p>
          </div>
        </Dialog>
      ) : null}

      {conflict ? (
        <Dialog
          title="Published elsewhere first"
          subtitle={`${whoLabel(conflict.publishedBy ?? '') || 'The other copy of the console'}${
            timeOf(conflict.publishedAt ?? '')
              ? `, ${formatRelative(timeOf(conflict.publishedAt ?? ''))}`
              : ''
          }`}
          confirmLabel="Publish mine over theirs"
          danger
          canConfirm
          busy={publishing || actions.pending === 'take-theirs'}
          onConfirm={() => {
            setConflict(null)
            void publish(true)
          }}
          onCancel={() => setConflict(null)}
        >
          <div className={lore.conflict}>
            <p>
              They published the services after the list here started from the website. Publishing
              yours replaces their list and hours on the website. Taking theirs drops the list and
              the hours here for what the website has now. Cancel keeps yours as it is, to compare
              first.
            </p>
            <div className={lore.actions}>
              <Button
                size="sm"
                disabled={publishing}
                onClick={() => {
                  setConflict(null)
                  void actions.takeTheirs().then((done) => {
                    if (done)
                      notify.done('Theirs taken', { detail: 'The list here is the website’s.' })
                  })
                }}
              >
                Take theirs
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}
