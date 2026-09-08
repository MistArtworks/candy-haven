import type { ReactNode } from 'react'
import { Sigil } from '@renderer/components/sigil/Sigil'
import { useArtwork } from '@renderer/hooks/useProjects'
import styles from './Artwork.module.scss'

export interface ArtworkProps {
  path: string | null
  /** Decode width requested from the main process. */
  width?: number
  /** Aspect ratio of the frame. Covers are square; canvases are 9:16. */
  ratio?: 'square' | 'portrait'
  alt: string
  className?: string
}

/**
 * Artwork frame.
 *
 * The image arrives as a data URL from the main process rather than a `file://`
 * src, because the renderer's CSP allows only `'self'` and `data:` for images —
 * loosening it would hand a compromised renderer read access to the disk.
 *
 * With nothing selected the frame shows the sigil at low contrast rather than a
 * broken-image glyph or a fabricated placeholder: an empty slot should read as
 * a slot that is empty.
 */
export function Artwork({
  path,
  width = 480,
  ratio = 'square',
  alt,
  className
}: ArtworkProps): ReactNode {
  const dataUrl = useArtwork(path, width)

  const classes = [styles.frame, styles[ratio], className ?? ''].filter(Boolean).join(' ')

  if (!dataUrl) {
    return (
      <div className={classes} data-empty="true">
        <Sigil size={28} weight={1} className={styles.placeholder} />
        {path ? <span className={styles.unreadable}>UNREADABLE</span> : null}
      </div>
    )
  }

  return (
    <div className={classes}>
      <img src={dataUrl} alt={alt} className={styles.image} draggable={false} />
    </div>
  )
}
