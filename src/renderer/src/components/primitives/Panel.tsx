import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { panelVariants } from '@renderer/motion/transitions'
import styles from './Panel.module.scss'

export interface PanelProps {
  /** Institutional label rendered in the panel's header rule. */
  label?: string
  /** Zero-padded index shown before the label, e.g. `03`. */
  index?: string
  /**
   * A mark drawn in the header rule, between the index and the label.
   *
   * Optional and absent by default, so no existing panel changes. Where it is
   * used it should be used across a whole view — one iconed panel among five
   * plain ones reads as an oversight rather than as emphasis.
   */
  icon?: ReactNode
  /** Right-aligned header slot: status dots, counts, actions. */
  aside?: ReactNode
  children: ReactNode
  className?: string
  /** Adds the crimson focal treatment. Use for at most one panel per view. */
  focal?: boolean
  /** Participates in a parent `gridVariants` stagger. */
  animated?: boolean
  /** Removes inner padding when the child manages its own. */
  flush?: boolean
}

/**
 * The standard container of the console.
 *
 * A panel is a slab: square corners, hairline border, header rule with a
 * numbered label. The `focal` variant applies the crimson accent and should
 * appear at most once per view, honouring the brief's single-focal-object rule.
 */
export function Panel({
  label,
  index,
  icon,
  aside,
  children,
  className,
  focal = false,
  animated = true,
  flush = false
}: PanelProps): ReactNode {
  const classes = [
    styles.panel,
    focal ? styles.focal : '',
    flush ? styles.flush : '',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ')

  const content = (
    <>
      {label ? (
        <header className={styles.header}>
          <span className={styles.headerLabel}>
            {index ? <span className={styles.index}>{index}</span> : null}
            {icon ? <span className={styles.icon}>{icon}</span> : null}
            {label}
          </span>
          <span className={styles.rule} aria-hidden="true" />
          {aside ? <span className={styles.aside}>{aside}</span> : null}
        </header>
      ) : null}
      <div className={styles.body}>{children}</div>
    </>
  )

  if (!animated) {
    return <section className={classes}>{content}</section>
  }

  return (
    <motion.section className={classes} variants={panelVariants}>
      {content}
    </motion.section>
  )
}
