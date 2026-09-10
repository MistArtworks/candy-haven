/**
 * Tile captions.
 *
 * Split out of TileGrid.tsx rather than exported alongside it: a module that
 * exports both a component and a plain function breaks React Fast Refresh,
 * which then reloads the whole page on every edit instead of swapping the
 * component in place.
 */

/**
 * The second line of a shelf tile.
 *
 * Says nothing rather than "0 projects" for an empty folder: a genre just
 * created is not a problem to be reported, and a zero on every new shelf reads
 * as one. `TileGrid` renders an empty string as "Empty".
 */
export function describeFolder(projects: number, children: number): string {
  const parts = [
    projects > 0 ? `${projects} project${projects === 1 ? '' : 's'}` : null,
    children > 0 ? `${children} folder${children === 1 ? '' : 's'}` : null
  ].filter(Boolean)

  return parts.join(' · ')
}
