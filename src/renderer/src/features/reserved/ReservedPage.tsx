import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import type { SectionId } from '@shared/domain/navigation'
import { getSection } from '@shared/domain/navigation'
import { PageHeader } from '@renderer/components/primitives/PageHeader'
import { Panel } from '@renderer/components/primitives/Panel'
import { Sigil } from '@renderer/components/sigil/Sigil'
import { gridVariants } from '@renderer/motion/transitions'
import styles from './ReservedPage.module.scss'

export interface ReservedPageProps {
  sectionId: SectionId
  /** Capabilities this department will provide, shown as a commissioning plan. */
  scope: string[]
}

/**
 * Placeholder for a department that exists in the system's structure but has
 * not been commissioned yet.
 *
 * Deliberately not an empty page: it states what the section will do, so the
 * shape of the finished product is legible while it is being built. Each
 * feature replaces this component with its own page and flips `implemented` in
 * the shared navigation registry.
 */
export function ReservedPage({ sectionId, scope }: ReservedPageProps): ReactNode {
  const section = getSection(sectionId)

  return (
    <div className={styles.page}>
      <PageHeader
        index={section.order + 1}
        label={section.label}
        purpose={section.purpose}
        epigraph={section.epigraph}
      />

      <motion.div
        className={styles.grid}
        variants={gridVariants}
        initial="initial"
        animate="animate"
      >
        <Panel label="Status" index="01" focal className={styles.notice}>
          <div className={styles.noticeBody}>
            <Sigil size={72} weight={1} className={styles.mark} />
            <div>
              <p className={styles.headline}>Reserved — not yet in service</p>
              <p className={styles.copy}>
                This department is defined in the system registry and routed, but its capabilities
                have not been commissioned. It will come online in a future delivery.
              </p>
            </div>
          </div>
        </Panel>

        <Panel label="Commissioning scope" index="02">
          <ol className={styles.scope}>
            {scope.map((item, index) => (
              <li key={item} className={styles.scopeItem}>
                <span className={styles.scopeIndex}>{String(index + 1).padStart(2, '0')}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </motion.div>
    </div>
  )
}
