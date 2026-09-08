import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { getSection } from '@shared/domain/navigation'
import type { OverlayId } from '@shared/domain/overlays'
import { LIVE_OVERLAYS, OVERLAYS } from '@shared/domain/overlays'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Button } from '@renderer/components/primitives/Button'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import { gridVariants } from '@renderer/motion/transitions'
import { useOverlayInfo, useRiteState } from '@renderer/hooks/useRite'
import { OverlayCard } from './components/OverlayCard'
import styles from './ObservatoryPage.module.scss'

/**
 * OBSERVATORY — the broadcast kit.
 *
 * This page is a catalogue, not a feature. Each overlay in the shared registry
 * is a separate browser source with its own address and its own host page; this
 * lists them, shipped and reserved alike, and hands off to whichever one the
 * operator is running.
 *
 * Reserved entries carry their commissioning scope for the same reason
 * `ReservedPage` does at the department level: the shape of the finished kit
 * should be legible while it is being built.
 */
export function ObservatoryPage(): ReactNode {
  const section = getSection('observatory')
  const server = useOverlayInfo()
  const navigate = useNavigate()

  // The one live overlay's own readout, so the catalogue reports real state
  // rather than a generic "commissioned". When a second overlay ships this
  // wants a per-overlay lookup; with one, a direct read is honest and cheaper
  // than the indirection.
  const rite = useRiteState()
  const readouts: Partial<Record<OverlayId, string>> = {
    selection:
      rite.phase === 'spinning'
        ? 'Selecting'
        : rite.petitions.length > 0
          ? `${rite.petitions.length} filed`
          : 'Idle'
  }

  return (
    <div className={styles.page}>
      <PageHeader
        index={section.order + 1}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
        actions={
          <div className={styles.headerActions}>
            <StatusDot
              tone={server.running ? (server.clients > 0 ? 'online' : 'pending') : 'error'}
              label={
                server.running
                  ? server.clients > 0
                    ? `${server.clients} source${server.clients === 1 ? '' : 's'} attached`
                    : 'Awaiting a source'
                  : 'Server offline'
              }
            />
          </div>
        }
      />

      <motion.div
        className={styles.grid}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        <Panel
          label="Broadcast server"
          index="00"
          className={styles.serverPanel}
          aside={
            <StatusDot
              tone={server.running ? 'online' : 'error'}
              label={server.running ? 'Serving' : 'Offline'}
            />
          }
        >
          <div className={styles.server}>
            <p className={styles.hint}>
              Every overlay below is served from this address on its own path. Each one is a
              separate Browser source in OBS — add the ones you want and switch between them with
              scenes.
            </p>

            <FieldGrid columns={4}>
              <Field label="Root" value={server.url ?? '—'} mono selectable />
              <Field label="Port" value={server.port ?? '—'} mono />
              <Field
                label="Commissioned"
                value={`${LIVE_OVERLAYS.length} / ${OVERLAYS.length}`}
                mono
              />
              <Field label="Attached" value={server.clients} mono />
            </FieldGrid>

            {server.error ? <p className={styles.error}>{server.error}</p> : null}

            <Button size="sm" variant="ghost" onClick={() => void window.candy.overlay.restart()}>
              Restart server
            </Button>
          </div>
        </Panel>

        {OVERLAYS.map((overlay) => (
          <OverlayCard
            key={overlay.id}
            overlay={overlay}
            serverUrl={server.url}
            readout={readouts[overlay.id] ?? null}
            className={styles.span2}
          />
        ))}

        {/*
          THE CHORUS is catalogued but not registered, and the distinction is
          real rather than bookkeeping: every card above is a browser source
          this server answers for, and this one is code the operator pastes into
          Streamlabs. It appears here because from their side it is the same
          broadcast kit — but it has no address, so it cannot be an OverlayCard.
        */}
        <Panel
          label="THE CHORUS"
          index="06"
          className={styles.span2}
          aside={<StatusDot tone="pending" label="Pasted, not served" />}
        >
          <div className={styles.server}>
            <p className={styles.hint}>
              Chat as an institutional register — numbered entries, one crimson mark on the newest.
              Streamlabs hosts its own chat widget, so the console configures this one and hands
              over the code rather than serving it.
            </p>

            <Button size="sm" variant="ghost" onClick={() => navigate('/observatory/chorus')}>
              Configure and copy
            </Button>
          </div>
        </Panel>
      </motion.div>
    </div>
  )
}
