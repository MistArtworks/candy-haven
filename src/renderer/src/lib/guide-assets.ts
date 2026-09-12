/**
 * The screenshots the CATECHISM draws, keyed by filename.
 *
 * Globbed rather than imported one by one, which is what lets a new capture be
 * *dropped into the folder and referenced from Markdown* with no code change —
 * the same property that keeps the documentation editable. Vite resolves the
 * glob at build time, so every image is fingerprinted and bundled exactly as a
 * static import would be; nothing is read from disk at runtime.
 *
 * A name with no file resolves to null rather than to a broken image. The
 * renderer draws a captioned plate in its place, so a chapter written ahead of
 * its screenshot reads as deliberately unillustrated instead of as a fault.
 */

const FILES = import.meta.glob('../assets/guide/*.{png,jpg,jpeg,webp,gif,svg}', {
  eager: true,
  import: 'default',
  query: '?url'
}) as Record<string, string>

/**
 * Filename to URL. Built once at module load.
 *
 * Keyed on the basename alone so Markdown can say `![](archive-01-lenses.png)`
 * without carrying a path that would break the moment the folder moved.
 */
const BY_NAME = new Map<string, string>(
  Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1), url])
)

export function guideImage(name: string): string | null {
  // Tolerated so a path copied out of an editor still resolves: authors write
  // the basename, but a drag from the file tree writes the whole thing.
  const basename = name.slice(name.lastIndexOf('/') + 1)
  return BY_NAME.get(basename) ?? null
}

/** Every capture present, for the manifest check in the CATECHISM's own page. */
export function guideImageNames(): string[] {
  return [...BY_NAME.keys()].sort()
}
