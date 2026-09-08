import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import type { OverlayId } from '@shared/domain/overlays'
import { getOverlay } from '@shared/domain/overlays'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Field, FieldGrid } from '@renderer/components/primitives/Field'
import { Sigil } from '@renderer/components/sigil/Sigil'
import { gridVariants } from '@renderer/motion/transitions'
import styles from './ReservedOverlayPage.module.scss'

export interface ReservedOverlayPageProps {
  overlayId: OverlayId
}

/**
 * Detail page for an overlay that is catalogued but not yet built.
 *
 * The department-level equivalent of `ReservedPage`, one level down. Every
 * overlay in the registry is routed whether or not it exists, so a catalogue
 * entry is never a dead link and the intended broadcast kit stays legible while
 * it is being assembled.
 */
export function ReservedOverlayPage({ overlayId }: ReservedOverlayPageProps): ReactNode {
  const overlay = getOverlay(overlayId)

  return (
    <div className={styles.page}>
      <PageHeader
        index={overlay.order + 1}
        label={overlay.label}
        purpose={overlay.purpose}
        epigraph={overlay.epigraph}
        actions={
          <Link to="/observatory" className={styles.back}>
            Catalogue
          </Link>
        }
      />

      <motion.div
        className={styles.grid}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        <Panel label="Status" index="01" focal className={styles.notice}>
          <div className={styles.noticeBody}>
            <Sigil size={64} weight={1} className={styles.mark} />
            <div>
              <p className={styles.headline}>Reserved — not yet in service</p>
              <p className={styles.copy}>
                This overlay is declared in the broadcast registry and routed, but it has not been
                commissioned. Until it is, the server serves no source at its address.
              </p>
            </div>
          </div>
        </Panel>

        <Panel label="Commissioning scope" index="02" className={styles.span3}>
          <ol className={styles.scope}>
            {overlay.scope.map((item, index) => (
              <li key={item} className={styles.scopeItem}>
                <span className={styles.scopeIndex}>{String(index + 1).padStart(2, '0')}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel label="Intended source" index="03" className={styles.span3}>
          <FieldGrid columns={2}>
            <Field label="Path" value={`/${overlay.slug}`} mono />
            <Field
              label="Dimensions"
              value={`${overlay.canvas.width} × ${overlay.canvas.height}`}
              mono
            />
            <Field
              label="Form"
              value={overlay.form === 'full' ? 'Full scene' : 'Composited panel'}
              hint={
                overlay.form === 'full'
                  ? 'Occupies its own scene.'
                  : 'Sits over a capture; wants ?transparent=1.'
              }
            />
            <Field
              label="Catalogue position"
              value={String(overlay.order + 1).padStart(2, '0')}
              mono
            />
          </FieldGrid>
        </Panel>
      </motion.div>
    </div>
  )
}
