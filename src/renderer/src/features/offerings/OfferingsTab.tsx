import { useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { offeringStatus, type OfferingsState } from '@shared/domain/offerings'
import {
  OFFERING_KINDS,
  OFFERING_KIND_LABEL,
  OFFERING_LIMITS,
  OFFERING_STATUS_SHORT,
  type OfferingKind
} from '@shared/domain/offerings.constants'
import { useSystemStore } from '@renderer/app/store/system.store'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Dialog } from '@renderer/components/primitives/Dialog'
import { TextInput } from '@renderer/components/primitives/Input'
import { gridVariants } from '@renderer/motion/transitions'
import type { OfferingsActions } from '@renderer/hooks/useOfferings'
import { Segmented } from '@renderer/features/lore/components/Controls'
import { shift, useDragOrder } from '@renderer/features/lore/lib/order'
import lore from '@renderer/features/lore/Lore.module.scss'
import { OfferingEditor } from './OfferingEditor'
import { PublishBar } from './PublishBar'
import styles from './Offerings.module.scss'

const PRICE = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })

/** Switching services is guarded as leaving the page is: unsaved typing comes first. */
function guarded(go: () => void): void {
  const { unsaved, nudgeUnsaved } = useSystemStore.getState()
  if (unsaved?.dirty) {
    nudgeUnsaved()
    return
  }
  go()
}

/**
 * OFFERINGS: every service "Book me as a music producer" offers, in the
 * order the website lists them, and the one open beside the list. Drag a
 * row (or use its arrows) to reorder; a service kept here, off the
 * website, stays in the list, drawn back. Nothing reaches the website
 * until Publish, over the list.
 */
export function OfferingsTab({
  state,
  actions
}: {
  state: OfferingsState
  actions: OfferingsActions
}): ReactNode {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const offerings = state.offerings
  const selected = offerings.find((offering) => offering.id === selectedId) ?? offerings[0] ?? null
  const ids = offerings.map((offering) => offering.id)
  const dragRow = useDragOrder(ids, (next) => void actions.reorder(next))

  return (
    <>
      <PublishBar state={state} actions={actions} />

      <motion.div
        className={styles.grid}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        <Panel
          label="Services"
          index="01"
          focal
          className={styles.listPanel}
          aside={
            <span className={lore.count}>
              {offerings.filter((offering) => offering.shown).length} on the website
            </span>
          }
        >
          {offerings.length === 0 ? (
            <div className={styles.start}>
              <h3 className={styles.startTitle}>Nothing here yet</h3>
              <p className={styles.startText}>
                Start from the services the website offers now: each one comes in with its address,
                its write-up and its photo, and the hours come too, ready to edit. Or start from
                nothing, one service at a time.
              </p>
              <div className={lore.actions}>
                <Button
                  size="sm"
                  variant="primary"
                  busy={state.working === 'importing' || actions.pending === 'import'}
                  onClick={() => void actions.importFromSite()}
                >
                  Start from the website’s list
                </Button>
                <Button size="sm" onClick={() => setAdding(true)}>
                  New service
                </Button>
              </div>
            </div>
          ) : (
            <>
              <ul className={lore.chapters}>
                {offerings.map((offering, index) => {
                  const status = offeringStatus(offering, state.base)
                  return (
                    <li
                      key={offering.id}
                      className={lore.chapter}
                      data-selected={offering.id === selected?.id || undefined}
                      style={offering.shown ? undefined : { opacity: 0.6 }}
                      onClick={() => guarded(() => setSelectedId(offering.id))}
                      {...dragRow(offering.id)}
                    >
                      <span className={lore.grip} aria-hidden="true">
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                      </span>
                      <span className={lore.numeral}>{String(index + 1).padStart(2, '0')}</span>
                      <span />
                      <span className={lore.chapterText}>
                        <span className={lore.chapterTitle}>{offering.name || 'Untitled'}</span>
                        <span className={lore.chapterMeta}>
                          {OFFERING_KIND_LABEL[offering.kind]}
                          {offering.price !== null
                            ? ` · ${PRICE.format(offering.price)}`
                            : ' · No price'}
                        </span>
                      </span>
                      <span className={lore.chapterSide}>
                        <span className={lore.status} data-status={status}>
                          {OFFERING_STATUS_SHORT[status]}
                        </span>
                        <span className={lore.move}>
                          <button
                            type="button"
                            className={lore.moveButton}
                            aria-label={`Move ${offering.name} up`}
                            disabled={index === 0}
                            onClick={(event) => {
                              event.stopPropagation()
                              void actions.reorder(shift(ids, offering.id, -1))
                            }}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className={lore.moveButton}
                            aria-label={`Move ${offering.name} down`}
                            disabled={index === offerings.length - 1}
                            onClick={(event) => {
                              event.stopPropagation()
                              void actions.reorder(shift(ids, offering.id, 1))
                            }}
                          >
                            ↓
                          </button>
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
              <div className={styles.listFoot}>
                <Button
                  size="sm"
                  disabled={offerings.length >= OFFERING_LIMITS.items}
                  onClick={() => guarded(() => setAdding(true))}
                >
                  New service
                </Button>
              </div>
            </>
          )}
        </Panel>

        <Panel
          label={selected ? selected.name || 'Untitled' : 'Nothing open'}
          index="02"
          className={styles.editorPanel}
        >
          {selected ? (
            <OfferingEditor
              key={selected.id}
              offering={selected}
              state={state}
              actions={actions}
              onDeleted={() => setSelectedId(null)}
            />
          ) : (
            <p className={lore.empty}>Pick a service to edit it, or start a new one.</p>
          )}
        </Panel>
      </motion.div>

      {adding ? (
        <NewServiceDialog
          busy={actions.pending === 'create'}
          onCancel={() => setAdding(false)}
          onCreate={(kind, name) =>
            void actions.create({ kind, name }).then((created) => {
              if (!created) return
              setAdding(false)
              setSelectedId(created.id)
            })
          }
        />
      ) : null}
    </>
  )
}

const KIND_OPTIONS = OFFERING_KINDS.map((kind) => ({
  value: kind,
  label: OFFERING_KIND_LABEL[kind]
}))

function NewServiceDialog({
  busy,
  onCancel,
  onCreate
}: {
  busy: boolean
  onCancel: () => void
  onCreate: (kind: OfferingKind, name: string) => void
}): ReactNode {
  const [kind, setKind] = useState<OfferingKind>('commission')
  const [name, setName] = useState('')
  return (
    <Dialog
      title="A new service"
      subtitle="Kept here until you publish."
      confirmLabel="Make it"
      canConfirm={Boolean(name.trim())}
      busy={busy}
      onConfirm={() => onCreate(kind, name.trim())}
      onCancel={onCancel}
      footnote="A commission is made for the client and paid half upfront; a 1-1 session is booked at a time and paid in full."
    >
      <div className={styles.facts}>
        <TextInput
          label="Name"
          value={name}
          onChange={setName}
          maxLength={OFFERING_LIMITS.name}
          placeholder="Stem Mixing"
          onEnter={() => {
            if (name.trim()) onCreate(kind, name.trim())
          }}
        />
        <Segmented label="Kind" value={kind} options={KIND_OPTIONS} onChange={setKind} />
      </div>
    </Dialog>
  )
}
