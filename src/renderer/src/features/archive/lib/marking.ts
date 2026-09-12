/**
 * Marking a run of things, shared by every view that lists projects.
 *
 * A range is defined by the order the operator can *see*, and every view orders
 * its rows differently — the register by whatever sort is set, the unfiled
 * panel by how recently a project was touched, a shelf by its tiles. So the
 * component that draws the list resolves the span and hands over a finished
 * list of ids; nothing here needs to know what a project is.
 */

/**
 * Every id between `anchor` and `target` in `ordered`, inclusive.
 *
 * Direction-agnostic: Shift-clicking above the anchor selects upward, which is
 * what every file manager does and what the operator will expect without being
 * told.
 *
 * Falls back to the target alone when there is no anchor yet, or when either
 * end is not in the list. That makes the first Shift-click behave as an
 * ordinary mark rather than doing nothing at all — silence there reads as the
 * gesture being unsupported.
 */
export function resolveRange(
  ordered: readonly string[],
  anchor: string | null,
  target: string
): string[] {
  const to = ordered.indexOf(target)
  if (to === -1) return []

  const from = anchor ? ordered.indexOf(anchor) : -1
  if (from === -1) return [target]

  const [start, end] = from <= to ? [from, to] : [to, from]
  return ordered.slice(start, end + 1)
}
