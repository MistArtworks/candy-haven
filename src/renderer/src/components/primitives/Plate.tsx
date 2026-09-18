import { useEffect, useState, type ReactNode } from 'react'
import styles from './Plate.module.scss'

/**
 * What a filled plate asks for, in real pixels.
 *
 * A cover on this grid draws around 480px wide and the console scales to
 * 200%, so 960 is what it can actually be asked to fill. Decoded once and
 * cached by the query, which is cheaper than being soft on every card.
 */
const FILL_RESOLUTION = 960

export interface PlateProps {
  /** Absolute path to an image the archive has a copy of, or null. */
  path: string | null
  /** Drawn when there is no picture. Usually initials or a mark. */
  fallback?: ReactNode
  /** Rendered size in pixels. Square. Ignored when `fill` is set. */
  size?: number
  /**
   * Fills the width of whatever holds it, staying square.
   *
   * For a cover wall, where the plate *is* the object rather than a mark
   * beside a name — a fixed pixel size cannot do that without the grid and
   * the component both hard-coding the same number and drifting apart.
   */
  fill?: boolean
  /** Decoded width asked of the main process. Defaults to twice `size`. */
  resolution?: number
  alt?: string
  className?: string
}

/**
 * A picture the archive holds, drawn as a plate.
 *
 * Images cannot be loaded from disk directly: the renderer's CSP is
 * `img-src 'self' data:` — no `file:` — which is not an oversight but the
 * thing that stops a compromised renderer reading the drive through an
 * `<img>` tag. So the bytes come over the bridge, decoded and downscaled in
 * the main process by `projects:thumbnail`.
 *
 * That channel is named for the department that needed it first and has never
 * been project-specific; it takes a path and a width. Reusing it here beats a
 * second channel doing the same thing with a different name.
 *
 * Asks for twice the drawn size by default, so the plate is not soft on a
 * scaled interface — `appearance.uiScale` goes to 2.0, and an artist
 * photograph drawn at 96px on a 200% console is being asked for 192 real
 * pixels.
 */
export function Plate({
  path,
  fallback,
  size = 96,
  fill = false,
  resolution,
  alt = '',
  className
}: PlateProps): ReactNode {
  /*
   * One piece of state, carrying the path it belongs to.
   *
   * Two separate `source` and `failed` flags would have to be *cleared* when
   * the path changes, and clearing them in the body of the effect is a
   * synchronous setState that cascades a second render before paint. Keying
   * the held value by its path instead lets render decide whether what is
   * held is still the right picture, with nothing to reset.
   */
  const [held, setHeld] = useState<{ path: string; data: string | null } | null>(null)

  useEffect(() => {
    if (!path) return

    let alive = true

    void window.candy.projects
      .thumbnail(path, resolution ?? (fill ? FILL_RESOLUTION : size * 2))
      .then((data) => {
        if (alive) setHeld({ path, data })
      })
      .catch(() => {
        // A picture that cannot be read is drawn as its fallback rather than
        // as a broken frame. The record still knows where the file was, which
        // is what the sheet reports; this is only the drawing of it.
        if (alive) setHeld({ path, data: null })
      })

    return () => {
      alive = false
    }
  }, [path, size, fill, resolution])

  const source = held && held.path === path ? held.data : null

  // A filled plate takes its size from the grid and stays square through
  // `aspect-ratio`; a fixed one is told both dimensions.
  const style = fill ? undefined : { width: `${size}px`, height: `${size}px` }
  const classes = [styles.plate, fill ? styles.fill : '', className ?? ''].filter(Boolean).join(' ')

  if (!path || !source) {
    return (
      <div className={classes} style={style} aria-hidden={alt ? undefined : true}>
        <span className={styles.fallback}>{fallback}</span>
      </div>
    )
  }

  return (
    <div className={classes} style={style}>
      <img className={styles.image} src={source} alt={alt} draggable={false} />
    </div>
  )
}
