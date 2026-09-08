import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { OverlayDefinition } from '@shared/domain/overlays'
import { overlaySourceUrl } from '@shared/domain/overlays'
import { Panel } from '@renderer/components/primitives/Panel'
import { StatusDot } from '@renderer/components/primitives/StatusDot'
import styles from './OverlayCard.module.scss'

export interface OverlayCardProps {
  overlay: OverlayDefinition
  /** Server root, or null while the overlay server is not listening. */
  serverUrl: string | null
  /** Live figure for the shipped overlay this card describes, e.g. `3 filed`. */
  readout?: string | null
  /** Grid span, declared by the catalogue rather than assumed here. */
  className?: string
}

/**
 * One entry in the OBSERVATORY catalogue.
 *
 * A shipped overlay is a link to its host page and shows its browser-source
 * address; a reserved one lists what it will do. Same treatment either way, so
 * the kit reads as one set of instruments at different stages of commissioning
 * rather than as a working feature next to some empty boxes.
 *
 * No card is ever `focal`. The catalogue is a directory — giving one entry the
 * crimson treatment would claim a focal object for a page whose whole job is to
 * present a list evenly.
 */
export function OverlayCard({
  overlay,
  serverUrl,
  readout,
  className
}: OverlayCardProps): ReactNode {
  const live = overlay.implemented
  const sourceUrl = live && serverUrl ? overlaySourceUrl(serverUrl, overlay) : null

  const body = (
    <>
      <div className={styles.head}>
        <span className={styles.label}>{overlay.label}</span>
        <p className={styles.purpose}>{overlay.purpose}</p>
      </div>

      <p className={styles.epigraph}>{overlay.epigraph}</p>

      {live ? (
        <div className={styles.live}>
          {sourceUrl ? (
            <code className={styles.url}>{sourceUrl}</code>
          ) : (
            <p className={styles.offline}>Overlay server offline — no address to serve.</p>
          )}
          <span className={styles.enter}>Open console →</span>
        </div>
      ) : (
        <ol className={styles.scope}>
          {overlay.scope.map((item, index) => (
            <li key={item} className={styles.scopeItem}>
              <span className={styles.scopeIndex}>{String(index + 1).padStart(2, '0')}</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      )}

      <dl className={styles.meta}>
        <div>
          <dt>Source</dt>
          <dd>
            {overlay.canvas.width} × {overlay.canvas.height}
          </dd>
        </div>
        <div>
          <dt>Form</dt>
          <dd>{overlay.form === 'full' ? 'Full scene' : 'Composited panel'}</dd>
        </div>
      </dl>
    </>
  )

  return (
    <Panel
      label={`Overlay ${String(overlay.order + 1).padStart(2, '0')}`}
      index={String(overlay.order + 1).padStart(2, '0')}
      className={[styles.card, className ?? ''].filter(Boolean).join(' ')}
      aside={
        <StatusDot
          tone={live ? 'online' : 'offline'}
          label={live ? (readout ?? 'Commissioned') : 'Reserved'}
        />
      }
    >
      {/* Only a shipped overlay has somewhere to go; a reserved one is a
          read-only description, so it is deliberately not a dead link. */}
      {live ? (
        <Link to={overlay.slug} className={styles.body} data-live="true">
          {body}
        </Link>
      ) : (
        <div className={styles.body}>{body}</div>
      )}
    </Panel>
  )
}
